import os
import uuid
import sqlite3
import requests
import json
import logging
from functools import wraps
from flask import Flask, request, jsonify, url_for, redirect, session, g
from flask_mail import Mail, Message
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadTimeSignature
from authlib.integrations.flask_client import OAuth

app = Flask(__name__)
CORS(app, supports_credentials=True) # Enable CORS for frontend communication

# --- LOGGING CONFIGURATION ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
# In a production app, use environment variables (e.g., os.environ.get('SECRET_KEY'))
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-for-local-only')
app.config['SECURITY_PASSWORD_SALT'] = os.environ.get('SECURITY_PASSWORD_SALT', 'dev-salt')

# Requirement 2.4: Secure Token Storage
# Set this in your environment or a .env file
app.config['GITHUB_TOKEN'] = os.environ.get('GITHUB_TOKEN', '')

# OAuth Configuration (Replace placeholders with actual keys)
app.config['GOOGLE_CLIENT_ID'] = os.environ.get('GOOGLE_CLIENT_ID')
app.config['GOOGLE_CLIENT_SECRET'] = os.environ.get('GOOGLE_CLIENT_SECRET')
app.config['FACEBOOK_CLIENT_ID'] = os.environ.get('FACEBOOK_CLIENT_ID')
app.config['FACEBOOK_CLIENT_SECRET'] = os.environ.get('FACEBOOK_CLIENT_SECRET')
app.config['GITHUB_CLIENT_ID'] = os.environ.get('GITHUB_CLIENT_ID')
app.config['GITHUB_CLIENT_SECRET'] = os.environ.get('GITHUB_CLIENT_SECRET')

oauth = OAuth(app)
oauth.register(name='google', server_metadata_url='https://accounts.google.com/.well-known/openid-configuration', client_kwargs={'scope': 'openid email profile'})
oauth.register(name='facebook', api_base_url='https://graph.facebook.com/', access_token_url='https://graph.facebook.com/oauth/access_token', authorize_url='https://www.facebook.com/dialog/oauth', client_kwargs={'scope': 'email public_profile'})
oauth.register(name='github', api_base_url='https://api.github.com/', access_token_url='https://github.com/login/oauth/access_token', authorize_url='https://github.com/login/oauth/authorize', client_kwargs={'scope': 'user:email'})

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

# --- GLOBAL ERROR HANDLER ---
@app.errorhandler(Exception)
def handle_exception(e):
    """Centralized error handling for professional API responses."""
    logger.error(f"Unhandled Exception: {str(e)}", exc_info=True)
    if isinstance(e, (SignatureExpired, BadTimeSignature)):
        return jsonify({"error": "Session or token expired. Please log in again."}), 401
    return jsonify({"error": "An internal server error occurred. Please try again later."}), 500

# --- VALIDATION SCHEMAS ---
SCHEMAS = {
    'register': {
        'email': {'type': str, 'required': True},
        'password': {'type': str, 'required': True},
        'name': {'type': str, 'required': True}
    },
    'login': {
        'email': {'type': str, 'required': True},
        'password': {'type': str, 'required': True}
    },
    'task': {
        'title': {'type': str, 'required': True},
        'description': {'type': str, 'required': True},
        'category': {'type': str, 'required': True},
        'priority': {'type': str, 'required': False},
        'complexitySize': {'type': str, 'required': False}
    },
    'profile': {
        'name': {'type': str, 'required': True}
    },
    'group': {
        'groupName': {'type': str, 'required': True}
    }
}

def get_db_connection():
    if 'db' not in g:
        db_path = os.path.join(os.path.dirname(__file__), 'taskly.db')
        g.db = sqlite3.connect(db_path)
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db_connection(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def get_auth_user():
    """Helper to retrieve the current user from the Authorization header."""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(" ")[1]
    try:
        email = serializer.loads(token, salt=app.config['SECURITY_PASSWORD_SALT'], max_age=86400)
        conn = get_db_connection()
        # Requirement: Ensure soft-deleted users cannot perform authenticated actions
        user = conn.execute('SELECT * FROM users WHERE email = ? AND isActive = 1', (email,)).fetchone()
        return dict(user) if user else None
    except:
        return None

def validate_payload(schema_name):
    """Decorator to validate the JSON body against a schema."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            schema = SCHEMAS.get(schema_name, {})
            data = request.get_json()
            if not data:
                return jsonify({"error": "Missing JSON request body"}), 400
            
            for field, rules in schema.items():
                val = data.get(field)
                if rules.get('required') and not val:
                    return jsonify({"error": f"Field '{field}' is required"}), 400
                if val and not isinstance(val, rules['type']):
                    return jsonify({"error": f"Field '{field}' must be of type {rules['type'].__name__}"}), 400
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def login_required(f):
    """Decorator to protect routes and inject the authenticated user."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_auth_user()
        if not user:
            return jsonify({"error": "Unauthorized or session expired"}), 401
        return f(user, *args, **kwargs)
    return decorated_function

def get_state(current_user=None):
    """Helper to return the full state required by the frontend hydrateAppState."""
    if not current_user:
        return {"currentUser": None, "users": [], "groups": [], "tasks": [], "progressLogs": []}

    user_id = current_user.get('id')
    conn = get_db_connection()
    
    if current_user.get('globalRole') == 'admin':
        users_rows = conn.execute('SELECT * FROM users').fetchall()
    else:
        # Requirement 2.1: Only fetch users involved in the current user's workspace
        users_rows = conn.execute('''
            SELECT DISTINCT u.* FROM users u
            LEFT JOIN group_members gm ON u.id = gm.userId
            WHERE u.id = ? 
            OR gm.groupId IN (SELECT groupId FROM group_members WHERE userId = ?) 
            OR gm.groupId IN (SELECT id FROM groups WHERE leaderId = ?)
        ''', (user_id, user_id, user_id)).fetchall()

    users = []
    for row in users_rows:
        u = dict(row)
        u.pop('password', None)
        u['isActive'] = bool(u['isActive'])
        users.append(u)
        
    groups = []
    # Requirement 2.1: Only fetch groups the user belongs to or leads (unless Admin)
    if current_user.get('globalRole') == 'admin':
        group_query = 'SELECT * FROM groups'
        group_params = ()
    else:
        group_query = '''
            SELECT g.* FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.groupId
            WHERE g.leaderId = ? OR gm.userId = ?
        '''
        group_params = (user_id, user_id)

    for row in conn.execute(group_query, group_params).fetchall():
        g = dict(row)
        g['groupName'] = g.pop('name')
        members = conn.execute('SELECT userId FROM group_members WHERE groupId = ?', (g['id'],)).fetchall()
        g['memberIds'] = [m['userId'] for m in members]
        groups.append(g)

    # Fetch all comments and group them by taskId
    comments_rows = conn.execute('''
        SELECT c.*, u.name as userName 
        FROM comments c 
        JOIN users u ON c.userId = u.id 
        ORDER BY c.createdAt ASC
    ''').fetchall()
    comments_map = {}
    for c_row in comments_rows:
        c = dict(c_row)
        tid = c['taskId']
        if tid not in comments_map: comments_map[tid] = []
        comments_map[tid].append(c)

    tasks = []
    # Requirement 2.1: Only fetch tasks user is authorized to see
    if current_user.get('globalRole') == 'admin':
        task_query = 'SELECT * FROM tasks'
        task_params = ()
    else:
        # Tasks created by user, assigned to user, or belonging to user's groups
        task_query = '''
            SELECT DISTINCT t.* FROM tasks t
            LEFT JOIN group_members gm ON t.groupId = gm.groupId
            WHERE t.createdBy = ? OR t.assignedTo = ?
            OR (t.groupId IS NOT NULL AND (gm.userId = ? OR EXISTS(SELECT 1 FROM groups WHERE id = t.groupId AND leaderId = ?)))
        '''
        task_params = (user_id, user_id, user_id, user_id)

    for row in conn.execute(task_query, task_params).fetchall():
        t = dict(row)
        # Convert SQLite types to JS-friendly types
        t['isPersonal'] = bool(t['isPersonal'])
        t['isArchived'] = bool(t['isArchived'])
        t['comments'] = comments_map.get(t['id'], [])
        tasks.append(t)

    # Requirement 2.1: Only fetch logs for tasks the user is authorized to see
    task_ids = [t['id'] for t in tasks]
    progress_logs = []
    if task_ids:
        placeholders = ', '.join(['?'] * len(task_ids))
        query = f'SELECT * FROM progress_logs WHERE taskId IN ({placeholders})'
        progress_logs = [dict(row) for row in conn.execute(query, task_ids).fetchall()]
    
    
    return {
        "currentUser": current_user,
        "users": users,
        "groups": groups,
        "tasks": tasks,
        "progressLogs": progress_logs
    }

@app.route('/api/register', methods=['POST'])
@validate_payload('register')
def register():
    data = request.get_json()
    email = data.get('email', '').lower().strip()
    
    conn = get_db_connection()
    try:
        existing = conn.execute('SELECT 1 FROM users WHERE email = ?', (email,)).fetchone()
        if existing:
            return jsonify({"error": "Email already registered."}), 400
            
        # Assign 'admin' role if this is the first user in the database
        count_row = conn.execute('SELECT COUNT(*) FROM users').fetchone()
        role = "admin" if count_row[0] == 0 else "student"

        hashed_password = generate_password_hash(data.get('password'))
        user_id = f"id-{uuid.uuid4()}"

        conn.execute('''
            INSERT INTO users (id, name, email, password, profilePicture, githubUsername, globalRole, isActive)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, data.get('name'), email, hashed_password,
              data.get('profilePicture', ''), data.get('githubUsername', ''), role, 1))
        conn.commit()

        user_data = {
            "id": user_id,
            "name": data.get('name'),
            "email": email,
            "profilePicture": data.get('profilePicture', ''),
            "githubUsername": data.get('githubUsername', ''),
            "globalRole": role,
            "isActive": True
        }

    token = serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])
    return jsonify({
        "token": token,
        "state": get_state(user_data)
    }), 201

@app.route('/api/login', methods=['POST'])
@validate_payload('login')
def login():
    data = request.get_json()
    email = data.get('email', '').lower().strip()
    password = data.get('password')
    
    conn = get_db_connection()
    user_row = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    
    if not user_row or not check_password_hash(user_row['password'], password):
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
@login_required
def bootstrap(user):
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

    # Hash the new password and update in DB
    hashed_password = generate_password_hash(new_password)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET password = ? WHERE email = ?', (hashed_password, email))
    success = cursor.rowcount > 0
    conn.commit()
    
    if success:
        print(f"Password updated for {email}")
        return jsonify({"message": "Password updated successfully."}), 200
    
    return jsonify({"error": "User not found."}), 404

@app.route('/api/tasks', methods=['POST'])
@login_required
@validate_payload('task')
def create_task(user):
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
            return jsonify({"error": "The assigned user must be a member of the group."}), 400

    task_id = f"id-{uuid.uuid4()}"
    conn.execute('''
        INSERT INTO tasks (id, title, description, deadline, category, status, taskType, isPersonal, isArchived, priority, complexitySize, githubBranch, groupId, assignedTo, createdBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (task_id, data.get('title'), data.get('description'), data.get('deadline'), 
          data.get('category'), data.get('status', 'Pending'), data.get('taskType', 'deadline'), 
          data.get('isPersonal', 0), data.get('isArchived', 0), data.get('priority', 'Medium'),
          data.get('complexitySize', 'M'), data.get('githubBranch'), group_id, assigned_to, user['id']))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 201

@app.route('/api/tasks/<task_id>', methods=['PATCH'])
@login_required
def update_task(user, task_id):
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
            return jsonify({"error": "The assigned user must be a member of the group."}), 400

    conn.execute('''
        UPDATE tasks SET 
            title = ?, description = ?, deadline = ?, category = ?,
            status = ?, taskType = ?, isPersonal = ?, isArchived = ?, priority = ?, complexitySize = ?, githubBranch = ?, 
            groupId = ?, assignedTo = ?
        WHERE id = ?
    ''', (data.get('title'), data.get('description'), data.get('deadline'), data.get('category'),
          data.get('status'), data.get('taskType'), data.get('isPersonal'), data.get('isArchived'), data.get('priority'), data.get('complexitySize'), data.get('githubBranch'),
          group_id, assigned_to, task_id))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/tasks/<task_id>/status', methods=['PATCH'])
@login_required
def update_task_status(user, task_id):
    data = request.get_json()
    status = data.get('status')
    progress_note = data.get('progressNote', '')

    conn = get_db_connection()
    # Requirement 3.4/3.8: Log status changes for the activity feed
    conn.execute('''
        UPDATE tasks SET status = ?, progressNote = ? WHERE id = ?
    ''', (status, progress_note, task_id))
    
    log_id = f"log-{uuid.uuid4()}"
    conn.execute('''
        INSERT INTO progress_logs (id, taskId, userId, note, statusAtLog)
        VALUES (?, ?, ?, ?, ?)
    ''', (log_id, task_id, user['id'], progress_note, status))
    
    conn.commit()
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/profile', methods=['PATCH'])
@login_required
@validate_payload('profile')
def update_profile(user):
    data = request.get_json()
    name = data.get('name')
    pic = data.get('profilePicture', user['profilePicture'])

    conn = get_db_connection()
    conn.execute('UPDATE users SET name = ?, profilePicture = ? WHERE id = ?', (name, pic, user['id']))
    conn.commit()
    # Fetch fresh user data for the state response
    updated_user = conn.execute('SELECT * FROM users WHERE id = ?', (user['id'],)).fetchone()
    
    return jsonify({"state": get_state(dict(updated_user))}), 200

@app.route('/api/groups', methods=['POST'])
@login_required
@validate_payload('group')
def create_group(user):
    data = request.get_json()
    name = data.get('groupName')
    if not name: return jsonify({"error": "Group name is required"}), 400
    
    group_id = f"id-{uuid.uuid4()}"
    invite_code = uuid.uuid4().hex[:6].upper()
    
    conn = get_db_connection()
    # Requirement 2.1: Creator automatically becomes the leader
    conn.execute('INSERT INTO groups (id, name, inviteCode, leaderId) VALUES (?, ?, ?, ?)',
                 (group_id, name, invite_code, user['id']))
    conn.execute('INSERT INTO group_members (groupId, userId, role) VALUES (?, ?, ?)',
                 (group_id, user['id'], 'leader'))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 201

@app.route('/api/groups/join', methods=['POST'])
@login_required
def join_group(user):
    data = request.get_json()
    code = data.get('inviteCode', '').strip().upper()
    
    conn = get_db_connection()
    group = conn.execute('SELECT id FROM groups WHERE inviteCode = ?', (code,)).fetchone()
    
    if not group:
        return jsonify({"error": "Invalid invite code"}), 404
        
    # Check if already a member
    existing = conn.execute('SELECT 1 FROM group_members WHERE groupId = ? AND userId = ?', 
                            (group['id'], user['id'])).fetchone()
    if existing:
        return jsonify({"error": "You are already a member of this group"}), 400

    conn.execute('INSERT INTO group_members (groupId, userId, role) VALUES (?, ?, ?)',
                 (group['id'], user['id'], 'member'))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/groups/<group_id>/members/<target_id>/role', methods=['PATCH'])
@login_required
def update_group_member_role(user, group_id, target_id):
    data = request.get_json()
    new_role = data.get('role')
    
    conn = get_db_connection()
    group = conn.execute('SELECT leaderId FROM groups WHERE id = ?', (group_id,)).fetchone()
    
    if not group or (group['leaderId'] != user['id'] and user['globalRole'] != 'admin'):
        return jsonify({"error": "Forbidden: Only group leaders can manage roles"}), 403

    conn.execute('UPDATE group_members SET role = ? WHERE groupId = ? AND userId = ?',
                 (new_role, group_id, target_id))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/groups/<group_id>/leave', methods=['POST'])
@login_required
def leave_group(user, group_id):
    conn = get_db_connection()
    group = conn.execute('SELECT leaderId FROM groups WHERE id = ?', (group_id,)).fetchone()
    
    if group and group['leaderId'] == user['id']:
        return jsonify({"error": "Leaders cannot leave. Transfer leadership or delete the group."}), 400

    conn.execute('DELETE FROM group_members WHERE groupId = ? AND userId = ?', (group_id, user['id']))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/groups/<group_id>', methods=['DELETE'])
@login_required
def delete_group(user, group_id):
    conn = get_db_connection()
    group = conn.execute('SELECT leaderId FROM groups WHERE id = ?', (group_id,)).fetchone()
    
    if not group or (group['leaderId'] != user['id'] and user['globalRole'] != 'admin'):
        return jsonify({"error": "Forbidden"}), 403

    # Cleanup associated data
    conn.execute('DELETE FROM tasks WHERE groupId = ?', (group_id,))
    conn.execute('DELETE FROM group_members WHERE groupId = ?', (group_id,))
    conn.execute('DELETE FROM groups WHERE id = ?', (group_id,))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/groups/<group_id>/leader', methods=['POST'])
@login_required
def transfer_leadership(user, group_id):
    data = request.get_json()
    new_leader_id = data.get('newLeaderId')
    
    conn = get_db_connection()
    group = conn.execute('SELECT leaderId FROM groups WHERE id = ?', (group_id,)).fetchone()
    
    if not group or group['leaderId'] != user['id']:
        return jsonify({"error": "Only the current leader can transfer leadership"}), 403

    conn.execute('UPDATE groups SET leaderId = ? WHERE id = ?', (new_leader_id, group_id))
    conn.execute('UPDATE group_members SET role = "leader" WHERE groupId = ? AND userId = ?', (group_id, new_leader_id))
    conn.execute('UPDATE group_members SET role = "member" WHERE groupId = ? AND userId = ?', (group_id, user['id']))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/tasks/<task_id>/sync', methods=['POST'])
@login_required
def sync_task(user, task_id):
    conn = get_db_connection()
    task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    
    if not task or not task['githubBranch']:
        return jsonify({"error": "Task not syncable: No GitHub info provided."}), 400

    # Requirement 3.11: Autonomously fetch/parse GitHub data
    # We expect the branch field to be stored as "owner/repo:branch"
    try:
        repo_part, branch = task['githubBranch'].split(':')
        owner, repo = repo_part.split('/')
    except (ValueError, AttributeError):
        return jsonify({"error": "Invalid format. Use 'owner/repo:branch' (e.g. Saeed/Taskly:main)"}), 400

    # GitHub API: Compare the branch against 'main' to find net additions
    api_url = f"https://api.github.com/repos/{owner}/{repo}/compare/main...{branch}"
    headers = {"Accept": "application/vnd.github.v3+json"}
    if app.config['GITHUB_TOKEN']:
        headers["Authorization"] = f"token {app.config['GITHUB_TOKEN']}"

    try:
        resp = requests.get(api_url, headers=headers, timeout=10)
        if resp.status_code == 404:
            return jsonify({"error": "GitHub repository or branch not found. Please verify the 'owner/repo:branch' format and ensure the repository is public or your token is valid."}), 404

        if resp.status_code == 401:
            return jsonify({"error": "GitHub API Unauthorized: The GITHUB_TOKEN is invalid or has expired. Please verify your server-side configuration."}), 401
            
        if resp.status_code != 200:
            return jsonify({"error": f"GitHub API Error: {resp.status_code}"}), resp.status_code
            
        data = resp.json()
        # actualLoC is the sum of additions across all files in the diff
        actual_loc = sum(f.get('additions', 0) for f in data.get('files', []))
        
        conn.execute('UPDATE tasks SET actualLoC = ? WHERE id = ?', (actual_loc, task_id))
        conn.commit()
        return jsonify({"state": get_state(user), "syncedLoC": actual_loc}), 200
    except Exception as e:
        return jsonify({"error": f"Connection failed: {str(e)}"}), 500

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
@login_required
def delete_task(user, task_id):
    conn = get_db_connection()

    task = conn.execute('SELECT createdBy, groupId FROM tasks WHERE id = ?', (task_id,)).fetchone()
    if not task:
        return jsonify({"error": "Task not found."}), 404

    can_delete = user['globalRole'] == 'admin' or task['createdBy'] == user['id']
    if not can_delete and task['groupId']:
        is_leader = conn.execute('SELECT 1 FROM groups WHERE id = ? AND leaderId = ?', (task['groupId'], user['id'])).fetchone()
        if is_leader:
            can_delete = True

    if not can_delete:
        return jsonify({"error": "Forbidden: You do not have permission to delete this task."}), 403

    conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    conn.commit()
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/tasks/<task_id>/comments', methods=['POST'])
@login_required
def add_task_comment(user, task_id):
    data = request.get_json()
    text = data.get('text', '').strip()
    if not text:
        return jsonify({"error": "Comment text cannot be empty."}), 400
        
    comment_id = f"id-{uuid.uuid4()}"
    conn = get_db_connection()
    conn.execute('''
        INSERT INTO comments (id, taskId, userId, text)
        VALUES (?, ?, ?, ?)
    ''', (comment_id, task_id, user['id'], text))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 201

@app.route('/api/tasks/<task_id>/comments/<comment_id>', methods=['DELETE'])
@login_required
def delete_task_comment(user, task_id, comment_id):
    conn = get_db_connection()
    comment = conn.execute('SELECT userId FROM comments WHERE id = ?', (comment_id,)).fetchone()
    
    if not comment:
        return jsonify({"error": "Comment not found."}), 404
        
    # Requirement 2.1: Authorization Check
    if comment['userId'] != user['id'] and user['globalRole'] != 'admin':
        return jsonify({"error": "Forbidden: You can only delete your own comments."}), 403
        
    conn.execute('DELETE FROM comments WHERE id = ?', (comment_id,))
    conn.commit()
    
    return jsonify({"state": get_state(user)}), 200

@app.route('/api/login/<name>')
def social_login(name):
    # Check if this is a 'link' request by looking for a token in the query string
    token = request.args.get('token')
    if token:
        try:
            email = serializer.loads(token, salt=app.config['SECURITY_PASSWORD_SALT'], max_age=86400)
            session['link_email'] = email
        except:
            pass

    client = oauth.create_client(name)
    if not client:
        return jsonify({"error": "Invalid provider"}), 400
    redirect_uri = url_for('social_authorize', name=name, _external=True)
    return client.authorize_redirect(redirect_uri)

@app.route('/api/authorize/<name>')
def social_authorize(name):
    client = oauth.create_client(name)
    token = client.authorize_access_token()
    
    if name == 'google':
        user_info = token.get('userinfo')
    elif name == 'github':
        resp = client.get('user')
        user_info = resp.json()
        user_info['email'] = client.get('user/emails').json()[0]['email'] # Github privacy fallback
    else: # Facebook
        resp = client.get('me?fields=id,name,email,picture')
        user_info = resp.json()

    email = user_info.get('email', '').lower().strip()
    name_str = user_info.get('name') or user_info.get('login')
    github_user = user_info.get('login') if name == 'github' else None
    picture = user_info.get('picture', '') if isinstance(user_info.get('picture'), str) else user_info.get('picture', {}).get('data', {}).get('url', '')

    # Requirement: Handle Explicit Account Linking
    link_email = session.pop('link_email', None)
    if link_email:
        conn = get_db_connection()
        if name == 'github':
            conn.execute('UPDATE users SET githubUsername = ?, profilePicture = CASE WHEN profilePicture = "" THEN ? ELSE profilePicture END WHERE email = ?', 
                         (github_user, picture, link_email))
        conn.commit()
        # Redirect back to profile with a success flag
        return redirect("http://127.0.0.1:8000/profile.html?linked=success")

    conn = get_db_connection()
    user_row = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    
    if not user_row:
        # Automatic Sign-up
        # Assign 'admin' role if this is the first user in the database
        count_row = conn.execute('SELECT COUNT(*) FROM users').fetchone()
        role = "admin" if count_row[0] == 0 else "student"

        user_id = f"id-{uuid.uuid4()}"
        # Random password since they use OAuth
        dummy_password = generate_password_hash(str(uuid.uuid4()))
        conn.execute('''
            INSERT INTO users (id, name, email, password, profilePicture, githubUsername, globalRole, isActive)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, name_str, email, dummy_password, picture, github_user, role, 1))
        conn.commit()
        user_row = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    elif name == 'github':
        # Update existing user's GitHub username if they log in with GitHub
        conn.execute('UPDATE users SET githubUsername = ? WHERE id = ?', (github_user, user_row['id']))
        conn.commit()
    
    
    # Create Taskly Token
    app_token = serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])
    
    # Redirect back to frontend with the token
    # In production, use a more secure method than URL params if possible
    frontend_url = "http://127.0.0.1:8000/dashboard.html"
    return redirect(f"{frontend_url}?token={app_token}")

# --- ADMIN ROUTES ---

@app.route('/api/admin/users/<user_id>/active', methods=['PATCH'])
def toggle_user_active(user_id):
    admin = get_auth_user()
    if not admin or admin['globalRole'] != 'admin':
        return jsonify({"error": "Forbidden"}), 403
    if admin['id'] == user_id:
        return jsonify({"error": "You cannot deactivate yourself."}), 400
    
    conn = get_db_connection()
    user = conn.execute('SELECT isActive FROM users WHERE id = ?', (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    new_status = 0 if bool(user['isActive']) else 1
    conn.execute('UPDATE users SET isActive = ? WHERE id = ?', (new_status, user_id))
    conn.commit()
    return jsonify({"state": get_state(admin)}), 200

@app.route('/api/admin/users/<user_id>/role', methods=['PATCH'])
def update_user_role(user_id):
    admin = get_auth_user()
    if not admin or admin['globalRole'] != 'admin':
        return jsonify({"error": "Forbidden"}), 403
    
    data = request.get_json()
    new_role = data.get('role')
    if new_role not in ['admin', 'student']:
        return jsonify({"error": "Invalid role"}), 400
    if admin['id'] == user_id and new_role != 'admin':
        return jsonify({"error": "You cannot demote yourself."}), 400
        
    conn = get_db_connection()
    conn.execute('UPDATE users SET globalRole = ? WHERE id = ?', (new_role, user_id))
    conn.commit()
    return jsonify({"state": get_state(admin)}), 200

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
def remove_user(user_id):
    admin = get_auth_user()
    if not admin or admin['globalRole'] != 'admin':
        return jsonify({"error": "Forbidden"}), 403
    
    if admin['id'] == user_id:
        return jsonify({"error": "You cannot delete your own account."}), 400
        
    conn = get_db_connection()
    # Requirement: Soft delete to preserve historical data (authorship, logs, etc.)
    # We flip the isActive flag to 0. This prevents login but keeps the record for FK integrity.
    conn.execute('UPDATE users SET isActive = 0 WHERE id = ?', (user_id,))
    conn.commit()
    return jsonify({"state": get_state(admin)}), 200

if __name__ == '__main__':
    # Run on port 5000 as defined in your frontend api.js
    app.run(port=5000, debug=True)