import os
import random
import string
import requests
from flask import Flask, render_template, request, redirect, url_for, session, flash
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# --- APP INITIALIZATION ---
app = Flask(__name__, template_folder='template')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///gpms.db'
app.config['SECRET_KEY'] = 'a_very_secure_and_production_ready_secret_key'
db = SQLAlchemy(app)

# --- MODELS ---

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    github_username = db.Column(db.String(80), nullable=True) # Added for GitHub API
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=True)
    
    tasks = db.relationship('Task', backref='assignee', lazy=True)

class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    invite_code = db.Column(db.String(6), unique=True, nullable=False)
    # repo_url format: 'https://github.com/owner/repo' or 'owner/repo'
    repo_url = db.Column(db.String(255), nullable=True)

    users = db.relationship('User', backref='group', lazy=True)
    tasks = db.relationship('Task', backref='group', lazy=True)

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    assignee_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    complexity_size = db.Column(db.String(10), nullable=False)
    target_loc = db.Column(db.Integer, nullable=False)
    actual_loc = db.Column(db.Integer, default=0)
    status_color = db.Column(db.String(20), default='bg-primary')

# --- LOGIC ENGINE ---

class AccountabilityEngine:
    @staticmethod
    def get_target_loc(complexity_size):
        """Maps complexity size to target lines of code."""
        mapping = {'XS': 25, 'S': 100, 'M': 300, 'L': 700, 'XL': 1500}
        return mapping.get(complexity_size.upper(), 0)

    @staticmethod
    def calculate_task_health(actual_loc, target_loc, repo_url=None):
        """Calculates the health color of a task based on its progress."""
        if not repo_url:
            return 'bg-primary'  # Research/Standard Mode

        if target_loc == 0:
            return 'bg-success' if actual_loc > 0 else 'bg-primary'

        ratio = actual_loc / target_loc
        if ratio < 0.2:
            return 'bg-danger'
        elif ratio < 0.8:
            return 'bg-warning'
        else:
            return 'bg-success'

    @staticmethod
    def fetch_github_loc(repo_url, github_username, task_title):
        """
        Fetches the net lines of code (additions - deletions) added by a user 
        for a specific task using the GitHub API pagination.
        """
        if not repo_url or not github_username:
            return 0, "Missing repository URL or GitHub username."

        # Parse the repo_url to get owner and repo
        path = repo_url
        if repo_url.startswith('http'):
            parsed_url = urlparse(repo_url)
            path = parsed_url.path.strip('/')
        
        parts = path.split('/')
        if len(parts) >= 2:
            owner = parts[-2]
            repo = parts[-1]
            if repo.endswith('.git'):
                repo = repo[:-4]
        else:
            return 0, "Invalid repository URL format. Expected 'owner/repo' or full GitHub URL."

        base_api_url = f"https://api.github.com/repos/{owner}/{repo}"
        commits_url = f"{base_api_url}/commits?author={github_username}&per_page=100"
        
        headers = {'Accept': 'application/vnd.github.v3+json'}
        github_token = os.environ.get('GITHUB_TOKEN')
        
        if github_token:
            headers['Authorization'] = f'token {github_token}'
        else:
            print("WARNING: GITHUB_TOKEN environment variable not set. API rate limit will be severely restricted (60 req/hr).")

        try:
            all_commits = []
            page = 1
            
            # 1. Fetch ALL commits using pagination
            while True:
                paginated_url = f"{commits_url}&page={page}"
                response = requests.get(paginated_url, headers=headers, timeout=10)
                
                if response.status_code == 404:
                    return 0, f"Repository not found or API endpoint invalid: {owner}/{repo}"
                elif response.status_code in (403, 429):
                    return 0, "GitHub API rate limit exceeded."
                elif response.status_code != 200:
                    return 0, f"GitHub API error: {response.status_code} - {response.text}"
                    
                page_commits = response.json()
                if not isinstance(page_commits, list):
                     return 0, "Unexpected response from GitHub API."
                     
                if not page_commits:
                    break # No more commits
                    
                all_commits.extend(page_commits)
                page += 1

            if not all_commits:
                return 0, "No commits found for this user in the repository."

            net_loc = 0
            task_title_lower = task_title.lower().strip()
            
            # 2. Filter commits by task title and calculate net LOC
            for commit in all_commits:
                commit_msg = commit.get('commit', {}).get('message', '').lower().strip()
                
                # Check if the commit message contains the task title
                if task_title_lower in commit_msg:
                    commit_sha = commit.get('sha')
                    if not commit_sha: continue
                    
                    single_commit_url = f"{base_api_url}/commits/{commit_sha}"
                    commit_resp = requests.get(single_commit_url, headers=headers, timeout=10)
                    
                    if commit_resp.status_code == 200:
                        commit_data = commit_resp.json()
                        stats = commit_data.get('stats', {})
                        additions = stats.get('additions', 0)
                        deletions = stats.get('deletions', 0)
                        
                        # Calculate net lines of code
                        net_loc += max(0, additions - deletions)
                    elif commit_resp.status_code in (403, 429):
                         return net_loc, "Rate limit hit while fetching individual commits. Partial data saved."

            return net_loc, None
            
        except requests.exceptions.Timeout:
            return 0, "Connection to GitHub API timed out."
        except requests.exceptions.RequestException as e:
            return 0, f"Network error when connecting to GitHub: {str(e)}"

# --- ROUTES ---

# Helper to check if a user is valid
def get_current_user():
    if 'user_id' not in session:
        return None
    user = db.session.get(User, session['user_id'])
    if not user:
        session.pop('user_id', None)
    return user


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        github_username = request.form.get('github_username')

        if not username or not password or not github_username:
            flash('Username, password, and GitHub username are required.', 'danger')
            return redirect(url_for('register'))

        if User.query.filter_by(username=username).first():
            flash('Username is already taken.', 'warning')
            return redirect(url_for('register'))

        hashed_password = generate_password_hash(password)
        new_user = User(username=username, password_hash=hashed_password, github_username=github_username)
        db.session.add(new_user)
        db.session.commit()

        session['user_id'] = new_user.id
        flash('Registration successful! Welcome.', 'success')
        return redirect(url_for('onboarding'))
    
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()

        if user and check_password_hash(user.password_hash, password):
            session['user_id'] = user.id
            flash('Logged in successfully.', 'success')
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid username or password.', 'danger')
            return redirect(url_for('login'))

    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))

@app.route('/onboarding', methods=['GET'])
def onboarding():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
    
    if user.group_id:
        return redirect(url_for('dashboard'))

    return render_template('onboarding.html')

@app.route('/create_group', methods=['POST'])
def create_group():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    group_name = request.form.get('name')
    repo_url = request.form.get('repo_url')

    if not group_name:
        flash('Group name is required.', 'danger')
        return redirect(url_for('onboarding'))
        
    if repo_url and 'github.com' not in repo_url.lower():
        flash('Please provide a valid GitHub repository URL.', 'danger')
        return redirect(url_for('onboarding'))

    invite_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    while Group.query.filter_by(invite_code=invite_code).first():
        invite_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    new_group = Group(name=group_name, invite_code=invite_code, repo_url=repo_url)
    db.session.add(new_group)
    db.session.commit() 

    user.group_id = new_group.id
    db.session.commit()

    flash(f'Group "{group_name}" created! Your invite code is {invite_code}', 'success')
    return redirect(url_for('dashboard'))

@app.route('/join_group', methods=['POST'])
def join_group():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    invite_code = request.form.get('invite_code')
    group = Group.query.filter_by(invite_code=invite_code).first()

    if not group:
        flash('Invalid invite code.', 'danger')
        return redirect(url_for('onboarding'))

    user.group_id = group.id
    db.session.commit()

    flash(f'Successfully joined group "{group.name}"!', 'success')
    return redirect(url_for('dashboard'))

@app.route('/')
@app.route('/dashboard')
def dashboard():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    if not user.group_id:
        return redirect(url_for('onboarding'))

    group = user.group
    team_members = group.users
    tasks = group.tasks

    total_actual_loc = sum(task.actual_loc for task in tasks)
    total_target_loc = sum(task.target_loc for task in tasks)
    group_completion_rate = (total_actual_loc / total_target_loc * 100) if total_target_loc > 0 else 0

    return render_template('dashboard.html', 
                           group=group, 
                           team_members=team_members, 
                           tasks=tasks,
                           group_completion_rate=group_completion_rate)

@app.route('/task/create', methods=['POST'])
def create_task():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    if not user.group_id:
        return redirect(url_for('onboarding'))

    title = request.form.get('title')
    complexity = request.form.get('complexity_size')
    assignee_id = request.form.get('assignee_id')

    if not all([title, complexity, assignee_id]):
        flash('All fields are required to create a task.', 'danger')
        return redirect(url_for('dashboard'))

    target_loc = AccountabilityEngine.get_target_loc(complexity)
    
    new_task = Task(
        group_id=user.group_id,
        title=title,
        assignee_id=int(assignee_id),
        complexity_size=complexity,
        target_loc=target_loc
    )
    db.session.add(new_task)
    db.session.commit()

    flash('New task has been created.', 'success')
    return redirect(url_for('dashboard'))

@app.route('/task/sync/<int:task_id>', methods=['POST'])
def sync_task(task_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    task = db.session.get(Task, task_id)
    if not task or task.group_id != user.group_id:
        flash('Task not found or you do not have permission to sync it.', 'danger')
        return redirect(url_for('dashboard'))

    assignee = task.assignee
    group = task.group

    # Strict validation before syncing
    if not assignee or not assignee.github_username:
        flash(f'Cannot sync task: Assignee missing GitHub username.', 'danger')
        return redirect(url_for('dashboard'))
        
    if not group or not group.repo_url:
        flash(f'Cannot sync task: Group is missing a Repository URL.', 'danger')
        return redirect(url_for('dashboard'))

    # Call the real GitHub API, now passing the task title
    net_loc, error = AccountabilityEngine.fetch_github_loc(group.repo_url, assignee.github_username, task.title)

    if error:
        # If there's an error but we still calculated some LOC (e.g. rate limit hit mid-way), 
        # we can decide to save it or just warn. We'll warn and save what we have.
        if net_loc > 0:
             flash(f'GitHub Sync Warning: {error}', 'warning')
        else:
             flash(f'GitHub Sync Error: {error}', 'danger')
             return redirect(url_for('dashboard'))

    # Update actual_loc with exact net LOC
    task.actual_loc = net_loc
    
    # Calculate new health status
    task.status_color = AccountabilityEngine.calculate_task_health(
        task.actual_loc, 
        task.target_loc, 
        group.repo_url
    )
    
    db.session.commit()
    flash(f'Successfully synced with GitHub. Found {net_loc} net lines added by {assignee.github_username} for task "{task.title}".', 'success')

    return redirect(url_for('dashboard'))

# --- MAIN EXECUTION ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)