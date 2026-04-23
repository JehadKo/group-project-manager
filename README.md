# Student Group Project Manager

A professional productivity suite for managing university group projects, featuring a high-performance Flask API, persistent SQLite storage, and a modular JavaScript architecture.

This prototype helps students organize group work more clearly by supporting:
- account registration and login
- group creation and joining by invite code
- role-based access for students, group leaders, and system administrators
- task management with GitHub LoC (Lines of Code) synchronization
- project progress dashboards
- local backup export for demo purposes

## Project Overview

The system focuses on improving team accountability, visibility, and measurable output in academic environments through GitHub integration and role-based workflows.

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

The project now utilizes a Flask backend and a SQLite database for persistent storage and real-time coordination features.

## Pages Included

- `index.html` - landing page
- `login.html` - login page
- `register.html` - registration page
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

The app stores data in browser `localStorage` using these keys:

- `sgpm_users`
- `sgpm_groups`
- `sgpm_tasks`
- `sgpm_progress_logs`
- `sgpm_session`
- `sgpm_seeded`

## Functional Coverage

The implementation covers the planned front-end behaviors for:

- user management
- group management
- task management
- progress monitoring
- basic system administration

## Limitations

This version is intentionally a front-end prototype, so:

- passwords are stored as plain values in browser storage
- there is no real backend authentication
- there is no server database
- system monitoring is simulated through local metrics
- backup is implemented as JSON export of local demo data

## Notes For Submission

This project is suitable for:

- semester-project demonstration
- UI walkthroughs
- requirements coverage presentation
- future backend integration in later phases

The app was structured in a modular way so it can be extended later with real APIs and database storage.
