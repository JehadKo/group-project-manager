import os
import uuid
import sqlite3
import requests
from flask import Flask, request, jsonify
from flask_mail import Mail, Message
from flask_cors import CORS
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadTimeSignature

app = Flask(__name__)
CORS(app) # Enable CORS for frontend communication

# --- CONFIGURATION ---
# In a production app, use environment variables (e.g., os.environ.get('SECRET_KEY'))
app.config['SECRET_KEY'] = 'your-super-secret-dev-key'
app.config['SECURITY_PASSWORD_SALT'] = 'password-reset-salt-123'

# Requirement 2.4: Secure Token Storage
# Set this in your environment or a .env file
app.config['GITHUB_TOKEN'] = os.environ.get('GITHUB_TOKEN', '')

# Flask-Mail Settings (Example using Gmail)
# Note: For Gmail, you must use an "App Password" if 2FA is enabled.
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = 'your-email@gmail.com' 
app.config['MAIL_PASSWORD'] = 'your-app-password'
app.config['MAIL_DEFAULT_SENDER'] = 'your-email@gmail.com'

mail = Mail(app)
serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])

def get_db_connection():
    db_path = os.path.join(os.path.dirname(__file__), 'taskly.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def get_auth_user():
    """Helper to retrieve the current user from the Authorization header."""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(" ")[1]
    try:
        email = serializer.loads(token, salt=app.config['SECURITY_PASSWORD_SALT'], max_age=86400)
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        conn.close()
        return dict(user) if user else None
    except:
        return None

def get_state(current_user=None):
    """Helper to return the full state required by the frontend hydrateAppState."""
    conn = get_db_connection()
    
    users_rows = conn.execute('SELECT * FROM users').fetchall()
    users = []
    for row in users_rows:
        u = dict(row)
        u.pop('password', None)
        u['isActive'] = bool(u['isActive'])
        users.append(u)
        
    groups = []
    for row in conn.execute('SELECT * FROM groups').fetchall():
        g = dict(row)
        # Ensure keys match frontend expectations (name -> groupName)
        g['groupName'] = g.pop('name')
        members = conn.execute('SELECT userId FROM group_members WHERE groupId = ?', (g['id'],)).fetchall()
        g['memberIds'] = [m['userId'] for m in members]
        groups.append(g)

    tasks = [dict(row) for row in conn.execute('SELECT * FROM tasks').fetchall()]
    progress_logs = [dict(row) for row in conn.execute('SELECT * FROM progress_logs').fetchall()]
    
    conn.close()
    
    return {
        "currentUser": current_user,
        "users": users,
        "groups": groups,
        "tasks": tasks,
        "progressLogs": progress_logs
    }

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email', '').lower().strip()
    
    new_user = {
        "id": f"id-{uuid.uuid4()}",
        "name": data.get('name'),
        "email": email,
        "password": data.get('password'),
        "profilePicture": data.get('profilePicture', ''),
        "githubUsername": data.get('githubUsername', ''),
        "globalRole": "student",
        "isActive": True
    }

    conn = get_db_connection()
    try:
        existing = conn.execute('SELECT 1 FROM users WHERE email = ?', (email,)).fetchone()
        if existing:
            return jsonify({"error": "Email already registered."}), 400
            
        conn.execute('''
            INSERT INTO users (id, name, email, password, profilePicture, githubUsername, globalRole, isActive)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (new_user['id'], new_user['name'], new_user['email'], new_user['password'], 
              new_user['profilePicture'], new_user['githubUsername'], new_user['globalRole'], 1))
        conn.commit()
    finally:
        conn.close()
    
    token = serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])
    user_data = {k: v for k, v in new_user.items() if k != 'password'}
    
    return jsonify({
        "token": token,
        "state": get_state(user_data)
    }), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').lower().strip()
    password = data.get('password')
    
    conn = get_db_connection()
    user_row = conn.execute('SELECT * FROM users WHERE email = ? AND password = ?', (email, password)).fetchone()
    conn.close()
    
    if not user_row:
        return jsonify({"error": "Invalid email or password."}), 401
    
    user = dict(user_row)
    if not bool(user.get('isActive', 1)):
        return jsonify({"error": "Account is inactive."}), 403
        
    token = serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])
    user_data = {k: v for k, v in user.items() if k != 'password'}
    
    return jsonify({
        "token": token,
        "state": get_state(user_data)
    }), 200

@app.route('/api/bootstrap', methods=['GET'])
def bootstrap():
    user = get_auth_user()
    if not user:
        return jsonify({"error": "Unauthorized or session expired"}), 401
        
    user_data = {k: v for k, v in user.items() if k != 'password'}
    return jsonify({
        "state": get_state(user_data)
    }), 200

@app.route('/api/logout', methods=['POST'])
def logout():
    return jsonify({"message": "Logged out successfully."}), 200

@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    email = data.get('email', '').lower().strip()

    # 1. Check if user exists
    conn = get_db_connection()
    user_row = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()

    if user_row:
        # 2. Generate secure token (expires in 30 minutes)
        token = serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])
        
        # 3. Construct reset link (Pointing to your frontend port, usually 8000 or 5500)
        frontend_url = "http://127.0.0.1:8000" 
        reset_url = f"{frontend_url}/reset-password.html?token={token}"

        # 4. Send the email
        msg = Message("Taskly — Password Reset Request", recipients=[email])
        msg.body = f"""Hello {user_row['name']},

You requested to reset your Taskly password. Please click the link below to set a new one:

{reset_url}

This link will expire in 30 minutes. If you did not make this request, please ignore this email.

Best regards,
The Taskly Team
"""
        try:
            mail.send(msg)
        except Exception as e:
            print(f"Mail Error: {e}")
            return jsonify({"error": "Unable to send email at this time."}), 500

    # We return 200 even if the user wasn't found to prevent "Email Enumeration" attacks
    return jsonify({"message": "If that email is registered, a reset link has been sent."}), 200

@app.route('/api/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json()
    token = data.get('token')
    new_password = data.get('password')

    try:
        # Verify token and expiration (1800 seconds = 30 minutes)
        email = serializer.loads(token, salt=app.config['SECURITY_PASSWORD_SALT'], max_age=1800)
    except (SignatureExpired, BadTimeSignature):
        return jsonify({"error": "The reset link is invalid or has expired."}), 400

    # Update user password in DB
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET password = ? WHERE email = ?', (new_password, email))
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    if success:
        print(f"Password updated for {email}")
        return jsonify({"message": "Password updated successfully."}), 200
    
    return jsonify({"error": "User not found."}), 404

@app.route('/api/tasks', methods=['POST'])
def create_task():
    user = get_auth_user()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    group_id = data.get('groupId')
    assigned_to = data.get('assignedTo')
    
    conn = get_db_connection()
    
    # VERIFICATION LOGIC: Ensure assigned user belongs to the group (Requirement 3.2)
    if group_id and assigned_to:
        is_member = conn.execute('''
            SELECT 1 FROM group_members WHERE groupId = ? AND userId = ?
            UNION
            SELECT 1 FROM groups WHERE id = ? AND leaderId = ?
        ''', (group_id, assigned_to, group_id, assigned_to)).fetchone()
        
        if not is_member:
            conn.close()
            return jsonify({"error": "The assigned user must be a member of the group."}), 400

    task_id = f"id-{uuid.uuid4()}"
    conn.execute('''
        INSERT INTO tasks (id, title, description, deadline, category, status, taskType, isPersonal, complexitySize, githubBranch, groupId, assignedTo, createdBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (task_id, data.get('title'), data.get('description'), data.get('deadline'), 
          data.get('category'), data.get('status', 'Pending'), data.get('taskType', 'deadline'), 
          data.get('isPersonal', 0), data.get('complexitySize', 'M'), data.get('githubBranch'), group_id, assigned_to, user['id']))
    conn.commit()
    conn.close()
    
    return jsonify({"state": get_state(user)}), 201

@app.route('/api/tasks/<task_id>', methods=['PATCH'])
def update_task(task_id):
    user = get_auth_user()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    group_id = data.get('groupId')
    assigned_to = data.get('assignedTo')
    
    conn = get_db_connection()
    
    # VERIFICATION LOGIC: Ensure assigned user belongs to the group (Requirement 3.2)
    if group_id and assigned_to:
        is_member = conn.execute('''
            SELECT 1 FROM group_members WHERE groupId = ? AND userId = ?
            UNION
            SELECT 1 FROM groups WHERE id = ? AND leaderId = ?
        ''', (group_id, assigned_to, group_id, assigned_to)).fetchone()
        
        if not is_member:
            conn.close()
            return jsonify({"error": "The assigned user must be a member of the group."}), 400

    conn.execute('''
        UPDATE tasks SET 
            title = ?, description = ?, deadline = ?, category = ?,
            status = ?, taskType = ?, isPersonal = ?, complexitySize = ?, githubBranch = ?, 
            groupId = ?, assignedTo = ?
        WHERE id = ?
    ''', (data.get('title'), data.get('description'), data.get('deadline'), data.get('category'),
          data.get('status'), data.get('taskType'), data.get('isPersonal'), data.get('complexitySize'), data.get('githubBranch'),
          group_id, assigned_to, task_id))
    conn.commit()
    conn.close()
    
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/tasks/<task_id>/sync', methods=['POST'])
def sync_task(task_id):
    user = get_auth_user()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    
    conn = get_db_connection()
    task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    
    if not task or not task['githubBranch']:
        conn.close()
        return jsonify({"error": "Task not syncable: No GitHub info provided."}), 400

    # Requirement 3.11: Autonomously fetch/parse GitHub data
    # We expect the branch field to be stored as "owner/repo:branch"
    try:
        repo_part, branch = task['githubBranch'].split(':')
        owner, repo = repo_part.split('/')
    except (ValueError, AttributeError):
        conn.close()
        return jsonify({"error": "Invalid format. Use 'owner/repo:branch' (e.g. Saeed/Taskly:main)"}), 400

    # GitHub API: Compare the branch against 'main' to find net additions
    api_url = f"https://api.github.com/repos/{owner}/{repo}/compare/main...{branch}"
    headers = {"Accept": "application/vnd.github.v3+json"}
    if app.config['GITHUB_TOKEN']:
        headers["Authorization"] = f"token {app.config['GITHUB_TOKEN']}"

    try:
        resp = requests.get(api_url, headers=headers, timeout=10)
        if resp.status_code != 200:
            conn.close()
            return jsonify({"error": f"GitHub API Error: {resp.status_code}"}), resp.status_code
            
        data = resp.json()
        # actualLoC is the sum of additions across all files in the diff
        actual_loc = sum(f.get('additions', 0) for f in data.get('files', []))
        
        conn.execute('UPDATE tasks SET actualLoC = ? WHERE id = ?', (actual_loc, task_id))
        conn.commit()
        conn.close()
        return jsonify({"state": get_state(user), "syncedLoC": actual_loc}), 200
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Connection failed: {str(e)}"}), 500

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    user = get_auth_user()
    if not user: return jsonify({"error": "Unauthorized"}), 401
    conn = get_db_connection()
    conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    conn.commit()
    conn.close()
    return jsonify({"state": get_state(user)}), 200

if __name__ == '__main__':
    # Run on port 5000 as defined in your frontend api.js
    app.run(port=5000, debug=True)