# Implementation Report Section

## 1. Implementation Overview

The Student Group Project Manager was implemented as a front-end web application using plain HTML, CSS, and JavaScript. The goal of the implementation was to provide a working prototype that demonstrates the core system requirements for managing university group projects without relying on a backend server.

The system supports three stakeholder roles:
- Student
- Group Leader
- System Administrator

To make the prototype easy to demonstrate, all application data is stored in the browser using `localStorage`. This allows the system to simulate persistent behavior such as user accounts, groups, tasks, session state, and progress logs.

## 2. System Design and Architecture

The application follows a modular front-end structure:

- `HTML` was used to build separate pages for each main system function.
- `CSS` was used to provide a consistent visual design, responsive layout, cards, forms, and dashboard styling.
- `JavaScript` was split into reusable modules for storage, authentication, group management, task management, dashboard calculations, administrator features, and shared UI helpers.

This modular structure improves readability, maintainability, and future extensibility.

The main modules are:

- `storage.js` for browser data persistence and demo-data seeding
- `auth.js` for registration, login, logout, profile updates, and access control
- `groups.js` for creating groups, joining by invite code, and role management
- `tasks.js` for creating, editing, deleting, assigning, and updating tasks
- `dashboard.js` for progress calculations and summary metrics
- `admin.js` for user management and backup export
- `ui.js` for common rendering helpers and layout behavior

## 3. Implemented Functional Requirements

### 3.1 User Management

The system allows users to:
- register and create an account
- log in and log out
- update their profile information
- set a profile image through a URL or uploaded image preview

The system also preserves the current session using browser storage.

### 3.2 Group Management

The system allows:
- a user to create a group
- the group creator to automatically become the group leader
- users to join a group using an invite code
- the leader to manage member roles

Roles inside a group are represented through a role map, which controls what members are allowed to do.

### 3.3 Task Management

The system supports:
- creation of group tasks
- assignment of tasks to specific members
- editing and deletion of tasks by authorized users
- task properties such as title, description, deadline, category, status, and task type
- personal tasks that are separate from group tasks
- status updates and progress notes
- reminder-type tasks in addition to deadline-based tasks

### 3.4 Dashboard and Progress Monitoring

Each group can be monitored through dashboard information that includes:
- total number of tasks
- pending tasks
- ongoing tasks
- completed tasks
- completion percentage
- simple visual progress indicators

The main dashboard also summarizes assigned work, upcoming deadlines, and group activity.

### 3.5 System Administration

The administrator panel supports:
- viewing all system users
- activating and deactivating accounts
- removing non-protected demo accounts
- viewing total users, groups, tasks, and completion rate
- exporting local application data as a JSON backup file

## 4. Non-Functional Considerations

Although this project is a prototype, several non-functional requirements were considered during implementation:

### Performance
- The app is lightweight because it uses static front-end files only.
- All data operations are fast because they are performed directly in the browser.

### Security
- Basic role-based access logic is enforced in the interface.
- Different pages and actions are restricted depending on user type.
- This version does not provide production-level security because it is intended for prototype demonstration only.

### Reliability
- Data remains available after page refresh because it is saved in `localStorage`.
- Demo data is seeded automatically on first load to ensure the app is immediately usable.

### Usability
- The interface uses a consistent layout across pages.
- Task statuses and roles are visually labeled.
- The design is responsive so it can adapt to smaller screens.

## 5. Testing and Validation

The implementation was checked against the planned scenarios, including:

- registration and duplicate email validation
- login and logout behavior
- group creation and joining by invite code
- role updates by the group leader
- creation of personal and group tasks
- task editing, deletion, and status updates
- dashboard progress calculation
- administrator account actions
- backup export

In addition, JavaScript files were syntax-checked using Node module parsing.

## 6. Limitations

The current implementation has the following limitations:

- there is no real backend server
- there is no database outside browser storage
- passwords are stored in plain form for demonstration purposes only
- system performance monitoring is simulated through local metrics
- backup is limited to downloading JSON data from the browser

These limitations are acceptable for a semester-project prototype and also leave room for future expansion.

## 7. Future Improvements

Possible future enhancements include:

- integrating a real backend and database
- adding secure password hashing and authentication
- replacing localStorage with API-based persistence
- adding notifications and real-time collaboration
- expanding analytics and reporting
- adding calendar views and richer charts

## 8. Conclusion

The implemented system successfully demonstrates the main functions required for managing student group projects. It provides a structured workflow for creating groups, assigning tasks, tracking progress, and managing users. The modular design and clean interface make it a suitable semester-project prototype and a strong foundation for future full-stack development.
