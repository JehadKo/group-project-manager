import os
import random
import string
import requests
from flask import Flask, render_template, request, redirect, url_for, session, flash
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from urllib.parse import urlparse
from dotenv import load_dotenv
from datetime import datetime, date

# Load environment variables
load_dotenv()

# --- APP INITIALIZATION ---
app = Flask(__name__, template_folder='template', static_folder='static')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///gpms.db'
app.config['SECRET_KEY'] = 'a_very_secure_and_production_ready_secret_key'
db = SQLAlchemy(app)

# --- MODELS ---

# Association table for Many-to-Many relationship between User and Group
user_group_association = db.Table(
    'user_group',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('group_id', db.Integer, db.ForeignKey('group.id'), primary_key=True)
)

# Association table for Co-Leaders
group_coleaders = db.Table(
    'group_coleaders',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('group_id', db.Integer, db.ForeignKey('group.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    github_username = db.Column(db.String(80), nullable=True)  # Added for GitHub API
    group_role = db.Column(db.String(20), default='Member') # Legacy fallback

    # Track the user's currently "active" or "viewed" group
    current_group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=True)

    tasks = db.relationship('Task', backref='assignee', lazy=True)
    # The groups this user belongs to
    groups = db.relationship('Group', secondary=user_group_association, back_populates='users')


class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    invite_code = db.Column(db.String(6), unique=True, nullable=False)
    repo_url = db.Column(db.String(255), nullable=True)
    is_non_coding = db.Column(db.Boolean, default=False)  # Group level setting
    leader_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) # Adding leader_id for accurate role management

    users = db.relationship('User', secondary=user_group_association, back_populates='groups')
    co_leaders = db.relationship('User', secondary=group_coleaders, backref='co_lead_groups')
    tasks = db.relationship('Task', backref='group', lazy=True, cascade="all, delete-orphan")
    leader = db.relationship('User', foreign_keys=[leader_id])


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    deadline = db.Column(db.Date, nullable=True)
    assignee_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    # Core Task Fields
    complexity_size = db.Column(db.String(10), nullable=True)  # Can be null if non-coding
    target_loc = db.Column(db.Integer, default=0)
    actual_loc = db.Column(db.Integer, default=0)
    status_color = db.Column(db.String(20), default='bg-primary')
    feedback = db.Column(db.Text, nullable=True)

    # New Fields
    is_non_coding = db.Column(db.Boolean, default=False)
    is_reminder = db.Column(db.Boolean, default=False)
    feedback_unread = db.Column(db.Boolean, default=False)  # Red dot for leader
    is_completed = db.Column(db.Boolean, default=False)  # Simple checkmark for non-coding tasks
    is_highlighted = db.Column(db.Boolean, default=False)  # For highlighting reminders on dashboard


# --- LOGIC ENGINE ---

class AccountabilityEngine:
    @staticmethod
    def get_target_loc(complexity_size):
        if not complexity_size: return 0
        mapping = {'XS': 25, 'S': 100, 'M': 300, 'L': 700, 'XL': 1500}
        return mapping.get(complexity_size.upper(), 0)

    @staticmethod
    def calculate_task_health(actual_loc, target_loc, repo_url=None, is_non_coding=False, is_completed=False):
        if is_non_coding:
            return 'bg-success' if is_completed else 'bg-primary'

        if not repo_url:
            return 'bg-success' if is_completed else 'bg-primary'

        if target_loc == 0:
            return 'bg-success' if actual_loc > 0 else 'bg-primary'

        capped_actual = min(actual_loc, target_loc)
        ratio = capped_actual / target_loc

        if ratio < 0.2:
            return 'bg-danger'
        elif ratio < 0.8:
            return 'bg-warning'
        else:
            return 'bg-success'

    @staticmethod
    def fetch_github_loc(repo_url, github_username, task_title):
        if not repo_url or not github_username:
            return 0, "Missing repository URL or GitHub username."

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
            print(
                "WARNING: GITHUB_TOKEN environment variable not set. API rate limit will be severely restricted (60 req/hr).")

        try:
            all_commits = []
            page = 1

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
                    break

                all_commits.extend(page_commits)
                page += 1

            if not all_commits:
                return 0, "No commits found for this user in the repository."

            net_loc = 0
            task_title_lower = task_title.lower().strip()

            for commit in all_commits:
                commit_msg = commit.get('commit', {}).get('message', '').lower().strip()

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

                        net_loc += max(0, additions - deletions)
                    elif commit_resp.status_code in (403, 429):
                        return net_loc, "Rate limit hit while fetching individual commits. Partial data saved."

            return net_loc, None

        except requests.exceptions.Timeout:
            return 0, "Connection to GitHub API timed out."
        except requests.exceptions.RequestException as e:
            return 0, f"Network error when connecting to GitHub: {str(e)}"


# --- ROUTES ---

def get_current_user():
    if 'user_id' not in session:
        return None
    user = db.session.get(User, session['user_id'])
    if not user:
        session.pop('user_id', None)
    return user


def get_active_group(user):
    """Returns the currently active group for the user."""
    if not user.groups:
        return None
    if user.current_group_id:
        active_group = db.session.get(Group, user.current_group_id)
        if active_group in user.groups:
            return active_group

    user.current_group_id = user.groups[0].id
    db.session.commit()
    return user.groups[0]

def get_user_role(user, group):
    if not user or not group: return 'Member'
    if group.leader_id == user.id: return 'Leader'
    if user in group.co_leaders: return 'Co-Leader'
    return 'Member'

@app.context_processor
def inject_global_vars():
    user = get_current_user()
    group_role = 'Member'
    if user:
        user.is_authenticated = True
        active_group = get_active_group(user)
        if active_group:
             group_role = get_user_role(user, active_group)
    else:
        user = type('AnonymousUser', (), {'is_authenticated': False, 'groups': []})()
    return dict(current_user=user, today=date.today(), current_role=group_role)


@app.route('/')
def index():
    user = get_current_user()
    if user:
        return redirect(url_for('dashboard'))
    return render_template('index.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        github_username = request.form.get('github_username')

        if not username or not password:
            flash('Username and password are required.', 'error')
            return redirect(url_for('register'))

        if User.query.filter_by(username=username).first():
            flash('Username is already taken.', 'error')
            return redirect(url_for('register'))

        hashed_password = generate_password_hash(password)
        new_user = User(username=username, password_hash=hashed_password, github_username=github_username)
        db.session.add(new_user)
        db.session.commit()

        session['user_id'] = new_user.id
        flash('Registration successful! Welcome.', 'success')
        return redirect(url_for('dashboard'))

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
            flash('Invalid username or password.', 'error')
            return redirect(url_for('login'))

    return render_template('login.html')


@app.route('/logout')
def logout():
    session.pop('user_id', None)
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))


@app.route('/switch_group/<int:group_id>', methods=['POST'])
def switch_group(group_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    group_to_switch = db.session.get(Group, group_id)
    if group_to_switch and group_to_switch in user.groups:
        user.current_group_id = group_to_switch.id
        db.session.commit()
        flash(f'Switched to project "{group_to_switch.name}".', 'success')
    else:
        flash('Cannot switch to that group.', 'error')

    return redirect(request.referrer or url_for('dashboard'))

@app.route('/group/switch/<int:group_id>', methods=['POST'])
def switch_group_alias(group_id):
    # Route requested by user frontend
    return switch_group(group_id)

@app.route('/dashboard')
def dashboard():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    active_group = get_active_group(user)
    team_members = active_group.users if active_group else []

    all_tasks = active_group.tasks if active_group else []
    
    current_role = get_user_role(user, active_group) if active_group else 'Member'

    # Filter visibility based on role
    if current_role in ['Leader', 'Co-Leader']:
        filtered_tasks = all_tasks
    else:
        filtered_tasks = [t for t in all_tasks if t.assignee_id == user.id or t.is_reminder]

    # Filter out reminders to get pure tasks
    tasks = [t for t in filtered_tasks if not t.is_reminder]
    reminders = [t for t in filtered_tasks if t.is_reminder]

    # Calculate tasks in progress based on status_color
    tasks_in_progress = sum(1 for t in tasks if t.status_color != 'bg-success')


    # Sort reminders by deadline if exists
    def sort_key(r):
        return r.deadline if r.deadline else date.max

    reminders.sort(key=sort_key)

    highlighted_reminder = next((r for r in reminders if r.is_highlighted), None)
    if not highlighted_reminder and reminders:
        highlighted_reminder = reminders[0]  # Default highlight

    # Project Health / Completion Rate Logic
    group_completion_rate = 0
    if tasks:
        coding_tasks = [t for t in tasks if not t.is_non_coding]
        standard_tasks = [t for t in tasks if t.is_non_coding]

        coding_rate = 0
        if coding_tasks:
            total_actual_loc = sum(min(t.actual_loc, t.target_loc) for t in coding_tasks)
            total_target_loc = sum(t.target_loc for t in coding_tasks)
            if total_target_loc > 0:
                coding_rate = (total_actual_loc / total_target_loc) * 100

        standard_rate = 0
        if standard_tasks:
            completed_standard = sum(1 for t in standard_tasks if t.status_color == 'bg-success')
            standard_rate = (completed_standard / len(standard_tasks)) * 100

        if coding_tasks and standard_tasks:
            # Weighted average based on number of tasks
            total_weight = len(coding_tasks) + len(standard_tasks)
            group_completion_rate = ((coding_rate * len(coding_tasks)) + (standard_rate * len(standard_tasks))) / total_weight
        elif coding_tasks:
            group_completion_rate = coding_rate
        elif standard_tasks:
            group_completion_rate = standard_rate

    return render_template('dashboard.html',
                           current_user=user,
                           group=active_group,
                           team_members=team_members,
                           tasks=tasks,
                           reminders=reminders,
                           highlighted_reminder=highlighted_reminder,
                           group_completion_rate=group_completion_rate,
                           tasks_in_progress=tasks_in_progress)


@app.route('/tasks')
def tasks_route():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    active_group = get_active_group(user)
    team_members = active_group.users if active_group else []
    # Only show actual tasks, not reminders
    tasks_list = [t for t in active_group.tasks if not t.is_reminder] if active_group else []

    return render_template('tasks.html',
                           current_user=user,
                           group=active_group,
                           team_members=team_members,
                           tasks=tasks_list)


@app.route('/groups')
def groups():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    active_group = get_active_group(user)

    return render_template('groups.html',
                           current_user=user,
                           active_group=active_group)


@app.route('/admin')
def admin():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
    return render_template('admin.html', current_user=user)


@app.route('/feed')
def feed():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
    return render_template('feed.html', current_user=user)


@app.route('/profile')
def profile():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
    return render_template('profile.html', current_user=user)


@app.route('/profile/update', methods=['POST'])
def update_profile():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    github_username = request.form.get('github_username')
    new_password = request.form.get('new_password')

    if github_username is not None:
        user.github_username = github_username.strip()

    if new_password:
        user.password_hash = generate_password_hash(new_password)

    db.session.commit()
    flash('Profile updated successfully!', 'success')
    return redirect(url_for('profile'))


@app.route('/create_group', methods=['POST'])
def create_group():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    group_name = request.form.get('name')
    repo_url = request.form.get('repo_url')
    is_non_coding = request.form.get('is_non_coding') == 'on'

    if not group_name:
        flash('Group name is required.', 'error')
        return redirect(url_for('groups'))

    # Repo URL is optional, especially if non-coding
    if not repo_url:
        is_non_coding = True

    invite_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    while Group.query.filter_by(invite_code=invite_code).first():
        invite_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    new_group = Group(name=group_name, invite_code=invite_code, repo_url=repo_url, is_non_coding=is_non_coding, leader_id=user.id)
    new_group.users.append(user)
    db.session.add(new_group)
    db.session.commit()

    user.current_group_id = new_group.id
    db.session.commit()

    flash(f'Project "{group_name}" created! Invite code is {invite_code}', 'success')
    return redirect(url_for('groups'))


@app.route('/join_group', methods=['POST'])
def join_group():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    invite_code = request.form.get('invite_code')
    group = Group.query.filter_by(invite_code=invite_code).first()

    if not group:
        flash('Invalid invite code.', 'error')
        return redirect(url_for('groups'))

    if group in user.groups:
        flash(f'You are already a member of "{group.name}".', 'info')
    else:
        user.groups.append(group)
        user.current_group_id = group.id  # Set as active
        db.session.commit()
        flash(f'Successfully joined project "{group.name}"!', 'success')

    return redirect(url_for('groups'))


@app.route('/promote/<int:member_id>', methods=['POST'])
def promote(member_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
        
    active_group = get_active_group(user)
    
    if active_group and active_group.leader_id == user.id:
        target_user = db.session.get(User, member_id)
        if target_user and target_user in active_group.users:
            if target_user not in active_group.co_leaders:
                active_group.co_leaders.append(target_user)
                db.session.commit()
                flash(f'{target_user.username} has been promoted to Co-Leader.', 'success')
            else:
                flash(f'{target_user.username} is already a Co-Leader.', 'info')
        else:
            flash('User not found or not in group.', 'error')
    else:
        flash('Unauthorized: Only the Group Leader can promote members.', 'error')
        
    return redirect(request.referrer or url_for('dashboard'))

@app.route('/demote/<int:member_id>', methods=['POST'])
def demote(member_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
        
    active_group = get_active_group(user)
    if active_group and active_group.leader_id == user.id:
        target_user = db.session.get(User, member_id)
        if target_user and target_user in active_group.co_leaders:
            active_group.co_leaders.remove(target_user)
            db.session.commit()
            flash(f'{target_user.username} has been demoted to Member.', 'success')
        else:
            flash('User is not a Co-Leader or not in group.', 'error')
    else:
        flash('Unauthorized: Only the Group Leader can demote members.', 'error')
        
    return redirect(request.referrer or url_for('dashboard'))


@app.route('/task/create', methods=['POST'])
def create_task():
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    active_group = get_active_group(user)
    current_role = get_user_role(user, active_group) if active_group else 'Member'

    if current_role not in ['Leader', 'Co-Leader']:
        flash('Unauthorized: Only Leaders and Co-Leaders can create tasks.', 'error')
        return redirect(request.referrer or url_for('dashboard'))

    if not active_group:
        flash('You must select or join a project to create tasks.', 'error')
        return redirect(request.referrer or url_for('groups'))

    title = request.form.get('title')
    description = request.form.get('description')
    deadline_str = request.form.get('deadline')
    assignee_id_str = request.form.get('assignee_id')

    assignee_id = None
    if assignee_id_str:
        try:
            assignee_id = int(assignee_id_str)
            assignee = db.session.get(User, assignee_id)
            if not assignee or assignee not in active_group.users:
                flash('Assignee must be a member of the current group.', 'error')
                return redirect(request.referrer or url_for('tasks_route'))
        except ValueError:
            pass

    is_reminder = request.form.get('is_reminder') == 'on'

    # If the group itself is non-coding, or the user specifically checked it
    is_non_coding = active_group.is_non_coding or request.form.get('is_non_coding') == 'on'

    complexity = request.form.get('complexity_size') if not is_non_coding and not is_reminder else None

    if not title:
        flash('Title is required.', 'error')
        return redirect(request.referrer or url_for('tasks_route'))

    deadline = None
    if deadline_str:
        try:
            deadline = datetime.strptime(deadline_str, '%Y-%m-%d').date()
        except ValueError:
            flash("Invalid date format.", "error")

    target_loc = AccountabilityEngine.get_target_loc(complexity) if not is_non_coding and not is_reminder else 0

    new_task = Task(
        group_id=active_group.id,
        title=title,
        description=description,
        deadline=deadline,
        assignee_id=assignee_id,
        complexity_size=complexity,
        target_loc=target_loc,
        actual_loc=0,
        is_non_coding=is_non_coding,
        is_reminder=is_reminder
    )
    db.session.add(new_task)
    db.session.commit()

    flash('Item created successfully.', 'success')
    return redirect(request.referrer or url_for('tasks_route'))


@app.route('/task/feedback/<int:task_id>', methods=['POST'])
def submit_feedback(task_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
        
    task = db.session.get(Task, task_id)
    if not task:
        flash('Task not found.', 'error')
        return redirect(request.referrer or url_for('dashboard'))
        
    if task.assignee_id != user.id:
        flash('Unauthorized: Only the assigned user can submit feedback for this task.', 'error')
        return redirect(request.referrer or url_for('dashboard'))
        
    feedback_text = request.form.get('feedback')
    if feedback_text is not None:
        task.feedback = feedback_text.strip()
        task.feedback_unread = True
        db.session.commit()
        flash('Feedback submitted successfully.', 'success')
        
    return redirect(request.referrer or url_for('dashboard'))


@app.route('/task/highlight/<int:task_id>', methods=['POST'])
def highlight_reminder(task_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    task = db.session.get(Task, task_id)
    if task and task.group in user.groups and task.is_reminder:
        # Unhighlight others in this group
        for t in task.group.tasks:
            if t.is_reminder:
                t.is_highlighted = False
        # Highlight this one
        task.is_highlighted = True
        db.session.commit()
        flash('Reminder highlighted.', 'success')

    return redirect(request.referrer or url_for('dashboard'))


@app.route('/task/delete/<int:task_id>', methods=['POST'])
def delete_task(task_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    task = db.session.get(Task, task_id)
    if not task or task.group not in user.groups:
        flash('Task not found or you do not have permission to delete it.', 'error')
        return redirect(request.referrer or url_for('tasks_route'))

    db.session.delete(task)
    db.session.commit()
    flash(f'Deleted successfully.', 'success')
    return redirect(request.referrer or url_for('tasks_route'))


@app.route('/task/mark_read/<int:task_id>', methods=['POST'])
def mark_read(task_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    task = db.session.get(Task, task_id)
    if task and task.group in user.groups:
        task.feedback_unread = False
        db.session.commit()

    return redirect(request.referrer or url_for('tasks_route'))


@app.route('/task/sync/<int:task_id>', methods=['POST'])
def sync_task(task_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    task = db.session.get(Task, task_id)
    if not task or task.group not in user.groups:
        flash('Task not found or you do not have permission to sync it.', 'error')
        return redirect(url_for('tasks_route'))

    # Handle completion toggle for non-coding tasks
    if task.is_non_coding:
        is_completed = request.form.get('is_completed') == 'on'
        task.is_completed = is_completed
        task.status_color = 'bg-success' if is_completed else 'bg-primary'
        task.actual_loc = 1 if is_completed else 0
        task.target_loc = 1

    # Handle feedback update
    new_feedback = request.form.get('feedback')
    if new_feedback and new_feedback.strip():
        timestamp = f"[{user.username}]: {new_feedback.strip()}"
        if task.feedback:
            task.feedback = task.feedback + "\n\n" + timestamp
        else:
            task.feedback = timestamp
        task.feedback_unread = True  # Mark as unread so leader gets a red dot

    assignee = task.assignee
    group = task.group

    if task.is_non_coding:
        db.session.commit()
        flash(f'Task "{task.title}" updated successfully.', 'success')
        return redirect(url_for('tasks_route'))

    # It's a coding project, enforce GitHub sync
    if group and group.repo_url:
        if not assignee or not assignee.github_username:
            flash(f'Cannot sync task: Assignee missing GitHub username.', 'error')
            return redirect(url_for('tasks_route'))

        net_loc, error = AccountabilityEngine.fetch_github_loc(group.repo_url, assignee.github_username, task.title)

        if error:
            if net_loc > 0:
                flash(f'GitHub Sync Warning: {error}', 'warning')
            else:
                flash(f'GitHub Sync Error: {error}', 'error')
                return redirect(url_for('tasks_route'))

        task.actual_loc = net_loc
        task.status_color = AccountabilityEngine.calculate_task_health(
            task.actual_loc,
            task.target_loc,
            group.repo_url,
            task.is_non_coding,
            task.is_completed
        )

        db.session.commit()
        flash(
            f'Successfully synced with GitHub. Found {net_loc} net lines added by {assignee.github_username} for task "{task.title}".',
            'success')
    else:
        db.session.commit()
        flash(f'Task updated.', 'success')

    return redirect(url_for('tasks_route'))

@app.route('/group/leave/<int:group_id>', methods=['POST'])
def leave_group(group_id):
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))

    group = db.session.get(Group, group_id)
    if group and group in user.groups:
        user.groups.remove(group)
        if user.current_group_id == group.id:
            user.current_group_id = user.groups[0].id if user.groups else None
        db.session.commit()
        flash(f'You have left the project "{group.name}".', 'success')
    else:
        flash('Invalid group or you are not a member.', 'error')
        
    return redirect(url_for('groups'))

# --- MAIN EXECUTION ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)