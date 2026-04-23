# Student Group Project Manager

A front-end semester project website for managing university group projects using plain `HTML`, `CSS`, and `JavaScript`.

This prototype helps students organize group work more clearly by supporting:
- account registration and login
- group creation and joining by invite code
- role-based access for students, group leaders, and system administrators
- personal and group task management
- project progress dashboards
- local backup export for demo purposes

## Project Overview

The system is designed around the semester-project requirement of improving coordination, accountability, and visibility in student group projects.
The application leverages a Flask backend and SQLite database to ensure data persistence, secure authentication flows, and real-time coordination features.

## Main Features

### Student
- Create an account and log in
- Update profile information and profile image
- Join a group using an invite code
- Add personal tasks
- View assigned group tasks and personal tasks in a unified feed
- Update task status and progress notes
- View group dashboard progress

### Group Leader
- Create a group
- Automatically become the leader of that group
- Share invite codes with members
- Manage member roles
- Create, edit, assign, and delete group tasks
- Track task progress and completion rates

### System Administrator
- View all users in the demo system
- Activate or deactivate accounts
- Remove allowed demo accounts
- Monitor overall task and group metrics
- Export a backup of local data as JSON

## Technologies Used

- `HTML5`
- `CSS3`
- `JavaScript (ES Modules)`
- `Flask (Python)`
- `SQLite`


## Pages Included

- `index.html` - landing page
- `login.html` - login page
- `register.html` - registration page
- `forgot-password.html` - password recovery page
- `reset-password.html` - set new password page
- `dashboard.html` - main dashboard
- `groups.html` - group creation, joining, and role management
- `tasks.html` - task creation and task management
- `feed.html` - unified task feed
- `profile.html` - user profile page
- `admin.html` - administrator panel

## Project Structure

```text
Smester_Project/
|- index.html
|- login.html
|- register.html
|- forgot-password.html
|- reset-password.html
|- dashboard.html
|- groups.html
|- tasks.html
|- feed.html
|- profile.html
|- admin.html
|- README.md
|- docs/
|  `- IMPLEMENTATION_REPORT_SECTION.md
`- assets/
   |- css/
   |  `- styles.css
   `- js/
      |- app.js
      |- auth.js
      |- storage.js
      |- groups.js
      |- tasks.js
      |- dashboard.js
      |- admin.js
      |- ui.js
      `- pages/
         |- index.js
         |- login.js
         |- register.js
         |- dashboard.js
         |- groups.js
         |- tasks.js
         |- feed.js
         |- profile.js
         `- admin.js
```

## How To Run

Because this is a static front-end project, you can run it in any of these ways:

1. Open `index.html` directly in your browser.
2. Use VS Code Live Server if available.
3. Run a simple local server, for example:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Backend Setup (Optional for Email)

To enable real password reset emails, you must run the Flask backend:

1. Install dependencies: `pip install flask flask-mail flask-cors itsdangerous`
2. Navigate to the `Backend` folder.
3. Update `app.py` with your SMTP credentials (e.g., Gmail App Password).
4. Run the server: `python app.py`

The frontend is pre-configured in `assets/js/api.js` to connect to `http://127.0.0.1:5000/api`.

## Demo Accounts

These accounts are automatically seeded in `localStorage` on first load:

- Admin
  - Email: `admin@demo.com`
  - Password: `admin123`
- Group Leader
  - Email: `leader@demo.com`
  - Password: `leader123`
- Student
  - Email: `saeedmuhammadabdulkadir@gmail.com`
  - Password: `student123`
- Extra Member
  - Email: `member@demo.com`
  - Password: `member123`

## Data Storage

The system uses a hybrid storage approach:
- **Server-side**: Persistent data (Users, Groups, Tasks, Logs) is stored in a `SQLite` database (`taskly.db`).
- **Client-side**: The frontend uses `localStorage` as a fast cache for the application state and `sessionStorage` for temporary authentication tokens.

## Functional Coverage

The implementation covers the planned front-end behaviors for:

- user management
- group management
- task management
- progress monitoring
- basic system administration

## Limitations

Current system limitations include:
- **Encryption**: At-rest encryption for sensitive data like GitHub tokens is a planned security enhancement (Requirement 2.4).
- **Database Management**: Schema updates currently require manual intervention via initialization scripts.

## Notes For Submission

This project is suitable for:

- semester-project demonstration
- UI walkthroughs
- requirements coverage presentation
- future backend integration in later phases

The app was structured in a modular way so it can be extended later with real APIs and database storage.
