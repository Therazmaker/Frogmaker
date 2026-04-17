# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_data_files, copy_metadata

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('frogmaker_editor.html', '.'),
        ('editor_app.css', '.'),
        ('pixi.min.js', '.'),
        ('editor_state.js', '.'),
        ('editor_ui.js', '.'),
        ('editor_pixi_renderer.js', '.'),
        ('editor_project_io.js', '.'),
        ('editor_history.js', '.'),
        ('editor_core.js', '.'),
        ('editor_animation.js', '.'),
        *collect_data_files('imageio_ffmpeg'),
        *copy_metadata('imageio'),
        *copy_metadata('imageio-ffmpeg'),
    ],
    hiddenimports=['uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan', 'uvicorn.lifespan.on', 'fastapi', 'psd_tools', 'PIL', 'imageio', 'imageio_ffmpeg'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='Frogmaker_psd_folders',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
