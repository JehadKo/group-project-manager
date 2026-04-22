import os
import shutil

frontend_css = "Frontend/assets/css/styles.css"
backend_static_dir = "Backend/static/assets/css"

os.makedirs(backend_static_dir, exist_ok=True)
if os.path.exists(frontend_css):
    shutil.copy(frontend_css, backend_static_dir + "/styles.css")
