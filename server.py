import io
import json
import zipfile
import base64
from fastapi import FastAPI, File, UploadFile, Request, Form
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from pydantic import BaseModel
import os
from psd_tools import PSDImage
from PIL import Image
import sys
import webbrowser
import threading
import time
import tempfile
import socket
import urllib.request
import urllib.error
import imageio.v2 as imageio

app = FastAPI(title="Frogmaker Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STARTUP_HOST = "127.0.0.1"
STARTUP_PORT = 8000

def get_startup_url(port: int | None = None) -> str:
    return f"http://{STARTUP_HOST}:{port or STARTUP_PORT}"

def get_resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

def create_startup_indicator():
    try:
        import tkinter as tk
        from tkinter import ttk
    except Exception:
        return {
            "set_message": lambda _message: None,
            "close": lambda: None,
        }

    state = {"message": "Iniciando editor..."}
    ready = threading.Event()
    closed = threading.Event()

    def ui_thread():
        root = tk.Tk()
        root.title("Frogmaker")
        root.configure(bg="#1f1f1f")
        root.resizable(False, False)
        root.attributes("-topmost", True)

        width = 360
        height = 132
        screen_w = root.winfo_screenwidth()
        screen_h = root.winfo_screenheight()
        pos_x = max((screen_w - width) // 2, 0)
        pos_y = max((screen_h - height) // 2, 0)
        root.geometry(f"{width}x{height}+{pos_x}+{pos_y}")

        container = tk.Frame(root, bg="#1f1f1f", padx=18, pady=16)
        container.pack(fill="both", expand=True)

        title = tk.Label(
            container,
            text="Frogmaker",
            fg="#ffffff",
            bg="#1f1f1f",
            font=("Segoe UI", 12, "bold"),
            anchor="w",
        )
        title.pack(fill="x")

        subtitle = tk.Label(
            container,
            text="Preparando editor y servidor local...",
            fg="#9bb4c7",
            bg="#1f1f1f",
            font=("Segoe UI", 9),
            anchor="w",
        )
        subtitle.pack(fill="x", pady=(4, 10))

        style = ttk.Style(root)
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure(
            "Startup.Horizontal.TProgressbar",
            troughcolor="#2a2a2a",
            background="#2d9cff",
            bordercolor="#2a2a2a",
            lightcolor="#2d9cff",
            darkcolor="#2d9cff",
        )

        progress = ttk.Progressbar(
            container,
            mode="indeterminate",
            length=300,
            style="Startup.Horizontal.TProgressbar",
        )
        progress.pack(fill="x")
        progress.start(11)

        message_var = tk.StringVar(value=state["message"])
        message = tk.Label(
            container,
            textvariable=message_var,
            fg="#d6d6d6",
            bg="#1f1f1f",
            font=("Segoe UI", 10),
            anchor="w",
            justify="left",
            wraplength=320,
        )
        message.pack(fill="x", pady=(10, 0))

        def poll():
            if closed.is_set():
                try:
                    progress.stop()
                except Exception:
                    pass
                root.destroy()
                return
            message_var.set(state["message"])
            root.after(120, poll)

        def on_close():
            closed.set()
            try:
                progress.stop()
            except Exception:
                pass
            root.destroy()

        root.protocol("WM_DELETE_WINDOW", on_close)
        ready.set()
        poll()
        root.mainloop()

    threading.Thread(target=ui_thread, daemon=True).start()
    ready.wait(timeout=2)

    def set_message(message):
        state["message"] = message or "Iniciando editor..."

    def close():
        closed.set()

    return {
        "set_message": set_message,
        "close": close,
    }

def is_port_available(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()

def wait_for_server(url: str, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as response:
                if getattr(response, "status", 0) == 200:
                    return True
        except Exception:
            time.sleep(0.35)
    return False

def find_available_port(host: str, preferred_port: int, max_tries: int = 12) -> int:
    for offset in range(max_tries):
        candidate = preferred_port + offset
        if is_port_available(host, candidate):
            return candidate
    raise RuntimeError("No se encontro un puerto local disponible para Frogmaker.")

def open_browser_when_ready(indicator):
    indicator["set_message"]("Levantando servidor local...")
    startup_url = get_startup_url()
    if wait_for_server(startup_url, timeout=45):
        indicator["set_message"]("Servidor listo. Abriendo editor...")
        opened = False
        for _ in range(4):
            try:
                opened = bool(webbrowser.open(startup_url, new=2))
                if opened:
                    break
            except Exception:
                pass
            time.sleep(0.5)
        if not opened:
            indicator["set_message"](f"Servidor listo en {startup_url}")
            time.sleep(5)
        else:
            time.sleep(2)
        indicator["close"]()
    else:
        indicator["set_message"](f"No se pudo iniciar el servidor en {startup_url}")

app.mount("/static", StaticFiles(directory=get_resource_path(".")), name="static")

@app.get("/", response_class=HTMLResponse)
async def get_index():
    file_path = get_resource_path("frogmaker_editor.html")
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()

@app.post("/upload-psd")
async def upload_psd(file: UploadFile = File(...)):
    contents = await file.read()
    psd_stream = io.BytesIO(contents)
    psd = PSDImage.open(psd_stream)
    
    layers = []

    # Preserva la ruta de carpetas del PSD para reutilizar el arbol de capas del editor.
    def process_layer(layer, current_list, group_path=None):
        group_path = list(group_path or [])
        if layer.is_group():
            next_group_path = group_path + [layer.name] if layer.name else group_path
            for child in layer:
                process_layer(child, current_list, next_group_path)
        else:
            if layer.is_visible() and layer.width > 0 and layer.height > 0:
                try:
                    pil_img = layer.topil()
                    if pil_img:
                        buffered = io.BytesIO()
                        pil_img.save(buffered, format="PNG")
                        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

                        current_list.append({
                            "name": layer.name,
                            "x": layer.left,
                            "y": layer.top,
                            "width": layer.width,
                            "height": layer.height,
                            "data_url": f"data:image/png;base64,{img_str}",
                            "group_path": group_path,
                            "ui_group": "/".join(part.strip() for part in group_path if part and part.strip())
                        })
                except Exception as e:
                    print(f"Error procesando capa {layer.name}: {e}")

    for layer in psd:
        process_layer(layer, layers, [])
        
    return {
        "width": psd.width,
        "height": psd.height,
        "layers": layers
    }

@app.post("/extract-video-frames")
async def extract_video_frames(file: UploadFile = File(...), fps: int = Form(24), max_frames: int = Form(900)):
    suffix = os.path.splitext(file.filename or "reference.mp4")[1] or ".mp4"
    target_fps = max(1, min(int(fps or 24), 60))
    frame_limit = max(1, min(int(max_frames or 900), 1800))

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
      tmp.write(await file.read())
      tmp_path = tmp.name

    frames = []
    width = 0
    height = 0
    source_fps = target_fps
    duration_seconds = 0
    try:
        reader = imageio.get_reader(tmp_path, "ffmpeg")
        meta = reader.get_meta_data() or {}
        source_fps = float(meta.get("fps") or target_fps)
        duration_seconds = float(meta.get("duration") or 0)
        skip = max(1, round(source_fps / target_fps))

        for index, frame in enumerate(reader):
            if index % skip != 0:
                continue
            img = Image.fromarray(frame).convert("RGB")
            width, height = img.size
            img.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=82, optimize=True)
            frames.append("data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("utf-8"))
            if len(frames) >= frame_limit:
                break
        reader.close()
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    return {
        "name": file.filename or "video",
        "width": width,
        "height": height,
        "source_fps": source_fps,
        "frameRate": target_fps,
        "durationSeconds": duration_seconds,
        "frames": frames,
        "durationFrames": max(0, len(frames) - 1),
        "limited": len(frames) >= frame_limit
    }

class ExportRequest(BaseModel):
    ske_json: Dict[Any, Any]
    images: List[Dict[str, str]] # [{'name': 'layer1', 'data_url': 'base64...'}]

class AnimationFrame(BaseModel):
    frame: int
    data_url: str

class AnimationMediaRequest(BaseModel):
    name: str = "animacion"
    fps: int = 24
    background: str = "transparent"
    frames: List[AnimationFrame]

def safe_filename(value: str, fallback: str = "animacion") -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in (value or fallback))
    cleaned = cleaned.strip("_")
    return cleaned[:48] or fallback

def image_from_data_url(data_url: str) -> Image.Image:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    img_bytes = base64.b64decode(data_url)
    return Image.open(io.BytesIO(img_bytes)).convert("RGBA")

def rgba_to_transparent_gif_frame(img: Image.Image) -> Image.Image:
    alpha = img.getchannel("A")
    palette_frame = img.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=255)
    palette = palette_frame.getpalette() or []
    palette += [0] * (768 - len(palette))
    palette[255 * 3:255 * 3 + 3] = [0, 255, 0]
    palette_frame.putpalette(palette)
    transparency_mask = Image.eval(alpha, lambda px: 255 if px <= 10 else 0)
    palette_frame.paste(255, transparency_mask)
    return palette_frame

@app.post("/export-project")
async def export_project(req: ExportRequest):
    # This will generate a _ske.json, _tex.json and _tex.png, packaged in a ZIP
    memory_zip = io.BytesIO()
    
    # 1. Build ske.json
    ske_content = json.dumps(req.ske_json, indent=2)
    
    # 2. Build texture atlas
    # Very simple packing: pack vertically
    spacing = 2
    total_width = 0
    total_height = 0
    
    pil_images = {}
    
    for img_data in req.images:
        name = img_data['name']
        data_url = img_data['data_url']
        if data_url.startswith('data:image/png;base64,'):
            b64_str = data_url.split(',')[1]
            try:
                img_bytes = base64.b64decode(b64_str)
                img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
                pil_images[name] = img
                total_width = max(total_width, img.width)
                total_height += img.height + spacing
            except Exception as e:
                print(e)
                
    # Round to powers of 2 ideally, but we'll stick to precise bounds
    atlas_width = total_width
    atlas_height = max(total_height - spacing, 1)
    
    atlas_img = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))
    
    tex_json = {
        "width": atlas_width,
        "height": atlas_height,
        "name": req.ske_json.get("name", "Armature"),
        "imagePath": "texture.png",
        "SubTexture": []
    }
    
    current_y = 0
    for name, img in pil_images.items():
        atlas_img.paste(img, (0, current_y), img)
        tex_json["SubTexture"].append({
            "name": name,
            "x": 0,
            "y": current_y,
            "width": img.width,
            "height": img.height
        })
        current_y += img.height + spacing
        
    atlas_bytes = io.BytesIO()
    atlas_img.save(atlas_bytes, format="PNG")
    
    with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{req.ske_json.get('name', 'Armature')}_ske.json", ske_content)
        zf.writestr(f"{req.ske_json.get('name', 'Armature')}_tex.json", json.dumps(tex_json, indent=2))
        zf.writestr(f"texture.png", atlas_bytes.getvalue())
        
    memory_zip.seek(0)
    
        
    return StreamingResponse(memory_zip, media_type="application/zip", headers={
        "Content-Disposition": f"attachment; filename={req.ske_json.get('name', 'Armature')}_project.zip"
    })

@app.post("/export-animation-png-sequence")
async def export_animation_png_sequence(req: AnimationMediaRequest):
    memory_zip = io.BytesIO()
    name = safe_filename(req.name)

    with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt", f"PNG sequence export\nName: {name}\nFPS: {max(1, req.fps)}\nFrames: {len(req.frames)}\nBackground: {req.background}\n")
        for item in sorted(req.frames, key=lambda frame: frame.frame):
            img = image_from_data_url(item.data_url)
            png_bytes = io.BytesIO()
            img.save(png_bytes, format="PNG")
            zf.writestr(f"{name}_frame_{item.frame:04d}.png", png_bytes.getvalue())

    memory_zip.seek(0)
    return StreamingResponse(memory_zip, media_type="application/zip", headers={
        "Content-Disposition": f"attachment; filename={name}_png_sequence.zip"
    })

@app.post("/export-animation-gif")
async def export_animation_gif(req: AnimationMediaRequest):
    if not req.frames:
        return StreamingResponse(io.BytesIO(), media_type="image/gif")

    name = safe_filename(req.name)
    fps = max(1, int(req.fps or 24))
    duration_ms = max(1, round(1000 / fps))
    images = [
        rgba_to_transparent_gif_frame(image_from_data_url(item.data_url))
        for item in sorted(req.frames, key=lambda frame: frame.frame)
    ]

    gif_bytes = io.BytesIO()
    images[0].save(
        gif_bytes,
        format="GIF",
        save_all=True,
        append_images=images[1:],
        duration=duration_ms,
        loop=0,
        transparency=255,
        disposal=2,
    )
    gif_bytes.seek(0)
    return StreamingResponse(gif_bytes, media_type="image/gif", headers={
        "Content-Disposition": f"attachment; filename={name}.gif"
    })

if __name__ == "__main__":
    import uvicorn
    # Fix for Windowed mode Pyinstaller
    import sys, os
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")

    indicator = create_startup_indicator()
    STARTUP_PORT = find_available_port(STARTUP_HOST, 8000)

    threading.Thread(target=open_browser_when_ready, args=(indicator,), daemon=True).start()
    try:
        uvicorn.run(app, host=STARTUP_HOST, port=STARTUP_PORT)
    except Exception as exc:
        indicator["set_message"](f"Error al iniciar: {type(exc).__name__}")
        time.sleep(6)
        raise
    finally:
        indicator["close"]()
