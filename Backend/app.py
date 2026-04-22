import os
import uuid
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

# Mock Database for demonstration
mock_users = [
    {
        "id": "id-admin-001",
        "email": "admin@demo.com",
        "name": "Admin User",
        "password": "admin123",
        "globalRole": "admin",
        "isActive": True,
        "profilePicture": ""
    },
    {
        "id": "id-leader-001",
        "email": "leader@demo.com",
        "name": "Group Leader",
        "password": "leader123",
        "globalRole": "student",
        "isActive": True,
        "profilePicture": ""
    },
    {
        "id": "id-student-001",
        "email": "saeedmuhammadabdulkadir@gmail.com",
        "name": "Saeed",
        "password": "student123",
        "globalRole": "student",
        "isActive": True,
        "profilePicture": ""
    }
]

mock_groups = []
mock_tasks = []
mock_progress_logs = []

def get_state(current_user=None):
    """Helper to return the full state required by the frontend hydrateAppState."""
    return {
        "currentUser": current_user,
        "users": [{k: v for k, v in u.items() if k != 'password'} for u in mock_users],
        "groups": mock_groups,
        "tasks": mock_tasks,
        "progressLogs": mock_progress_logs
    }

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email', '').lower().strip()
    
    if any(u['email'] == email for u in mock_users):
        return jsonify({"error": "Email already registered."}), 400
    
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
    mock_users.append(new_user)
    
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
    
    user = next((u for u in mock_users if u['email'] == email and u['password'] == password), None)
    
    if not user:
        return jsonify({"error": "Invalid email or password."}), 401
    
    if not user.get('isActive', True):
        return jsonify({"error": "Account is inactive."}), 403
        
    token = serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])
    user_data = {k: v for k, v in user.items() if k != 'password'}
    
    return jsonify({
        "token": token,
        "state": get_state(user_data)
    }), 200

@app.route('/api/bootstrap', methods=['GET'])
def bootstrap():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({"error": "Unauthorized"}), 401
    
    token = auth_header.split(" ")[1]
    try:
        email = serializer.loads(token, salt=app.config['SECURITY_PASSWORD_SALT'], max_age=86400)
    except:
        return jsonify({"error": "Invalid session"}), 401
        
    user = next((u for u in mock_users if u['email'] == email), None)
    if not user:
        return jsonify({"error": "User not found"}), 404
        
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
    user = next((u for u in mock_users if u['email'] == email), None)

    if user:
        # 2. Generate secure token (expires in 30 minutes)
        token = serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])
        
        # 3. Construct reset link (Pointing to your frontend port, usually 8000 or 5500)
        frontend_url = "http://127.0.0.1:8000" 
        reset_url = f"{frontend_url}/reset-password.html?token={token}"

        # 4. Send the email
        msg = Message("Taskly — Password Reset Request", recipients=[email])
        msg.body = f"""Hello {user['name']},

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
    user = next((u for u in mock_users if u['email'] == email), None)
    if user:
        user['password'] = new_password
        print(f"Password updated for {email}")
        return jsonify({"message": "Password updated successfully."}), 200
    
    return jsonify({"error": "User not found."}), 404

if __name__ == '__main__':
    # Run on port 5000 as defined in your frontend api.js
    app.run(port=5000, debug=True)