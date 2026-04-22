import os
import re
import shutil

FRONTEND_DIR = "Frontend"
BACKEND_TEMPLATE_DIR = "Backend/template"
BACKEND_STATIC_DIR = "Backend/static"

# Ensure dirs exist
os.makedirs(BACKEND_TEMPLATE_DIR, exist_ok=True)
os.makedirs(BACKEND_STATIC_DIR, exist_ok=True)

# Copy assets
shutil.copytree(os.path.join(FRONTEND_DIR, "assets"), os.path.join(BACKEND_STATIC_DIR, "assets"), dirs_exist_ok=True)

# Replace common URLs in HTML
files_to_copy = ["index.html", "login.html", "register.html", "dashboard.html", "tasks.html", "groups.html", "admin.html", "feed.html", "profile.html"]

def fix_html(content):
    # Fix asset URLs
    content = re.sub(r'href="assets/(.*?)"', r'href="{{ url_for(\'static\', filename=\'assets/\1\') }}"', content)
    content = re.sub(r'src="assets/(.*?)"', r'src="{{ url_for(\'static\', filename=\'assets/\1\') }}"', content)
    
    # Fix page links
    content = re.sub(r'href="login\.html"', r'href="{{ url_for(\'login\') }}"', content)
    content = re.sub(r'href="register\.html"', r'href="{{ url_for(\'register\') }}"', content)
    content = re.sub(r'href="dashboard\.html"', r'href="{{ url_for(\'dashboard\') }}"', content)
    content = re.sub(r'href="tasks\.html\?new=1"', r'href="{{ url_for(\'tasks\', new=1) }}"', content)
    content = re.sub(r'href="tasks\.html"', r'href="{{ url_for(\'tasks\') }}"', content)
    content = re.sub(r'href="groups\.html\?new=1"', r'href="{{ url_for(\'groups\', new=1) }}"', content)
    content = re.sub(r'href="groups\.html"', r'href="{{ url_for(\'groups\') }}"', content)
    content = re.sub(r'href="admin\.html"', r'href="{{ url_for(\'admin\') }}"', content)
    content = re.sub(r'href="feed\.html"', r'href="{{ url_for(\'feed\') }}"', content)
    content = re.sub(r'href="profile\.html"', r'href="{{ url_for(\'profile\') }}"', content)
    content = re.sub(r'href="index\.html"', r'href="{{ url_for(\'index\') }}"', content)
    
    # Flash messages inclusion
    flash_block = '''{% with messages = get_flashed_messages(with_categories=true) %}
      {% if messages %}
        {% for category, message in messages %}
          <div class="flash flash-{{ category }}" data-type="{{ category }}">{{ message }}</div>
        {% endfor %}
      {% endif %}
    {% endwith %}'''
    content = content.replace('<div id="flash-container" class="flash-stack"></div>', f'<div id="flash-container" class="flash-stack">{flash_block}</div>')
    content = content.replace('<div id="flash-container"></div>', f'<div id="flash-container">{flash_block}</div>')
    
    return content

for filename in files_to_copy:
    src_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.exists(src_path):
        with open(src_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        content = fix_html(content)
        
        # Specific fixes
        if filename == "login.html":
            # Update action and method
            content = content.replace('id="login-form" class="form-grid" novalidate', 'id="login-form" class="form-grid" method="POST" action="{{ url_for(\'login\') }}"')
            # Change email to username
            content = content.replace('name="email" type="email" required\n            placeholder="name@university.edu" autocomplete="email"', 'name="username" type="text" required\n            placeholder="Username" autocomplete="username"')
            content = content.replace('id="email"', 'id="username"')
            content = content.replace('<label for="email">Email address</label>', '<label for="username">Username</label>')
            # Remove JS submit prevention
            content = re.sub(r'e\.preventDefault\(\);\n    setTimeout\(\(\) => \{[^}]*\}\n    \}, 1400\);', '', content, flags=re.DOTALL)
            # Make sure to keep btn submitting
            content = re.sub(r'e\.preventDefault\(\);\n      showFlash\(\'Please enter your email and password.\', \'error\'\); return;', 'showFlash(\'Please enter your username and password.\', \'error\'); return false;', content)
            
        elif filename == "register.html":
            # Update action and method
            content = content.replace('id="register-form" class="form-grid" novalidate', 'id="register-form" class="form-grid" method="POST" action="{{ url_for(\'register\') }}"')
            # Change email to username
            content = content.replace('name="email" type="email" required placeholder="you@example.com" autocomplete="email"', 'name="username" type="text" required placeholder="Username" autocomplete="username"')
            content = content.replace('id="email"', 'id="username"')
            content = content.replace('<label for="email">Email address</label>', '<label for="username">Username</label>')
            # Add Github Username
            github_field = '''<div class="field">
            <label for="github_username">GitHub Username</label>
            <input id="github_username" name="github_username" required placeholder="octocat" autocomplete="username"/>
          </div>'''
            content = content.replace('<label for="username">Username</label>', '<label for="username">Username</label>')
            content = re.sub(r'(<div class="field">\s*<label for="username">Username</label>.*?</div>)', r'\1\n          ' + github_field, content, flags=re.DOTALL)
            
            # Remove JS submit prevention
            content = re.sub(r'e\.preventDefault\(\);\n    showFlash\(\'Account created! Redirecting…\', \'success\'\);\n    setTimeout\(\(\) => \{ window\.location\.href = \'login\.html\'; \}, 1500\);', '', content, flags=re.DOTALL)
            content = re.sub(r'e\.preventDefault\(\);\n      showFlash\(.*?\); return;', 'return false;', content)
            
        elif filename == "dashboard.html":
            # Remove old tasks and add jinja
            pass
        
        dest_path = os.path.join(BACKEND_TEMPLATE_DIR, filename)
        with open(dest_path, "w", encoding="utf-8") as f:
            f.write(content)
            
print("Migration completed.")
