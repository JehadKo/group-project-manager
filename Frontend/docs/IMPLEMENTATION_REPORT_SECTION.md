# Implementation Report Section

## 1. Implementation Overview

The Student Group Project Manager (Taskly) is a full-stack web application designed to streamline university group collaborations. Originally a front-end prototype, the system now features a robust Flask backend and a SQLite database to ensure data persistence, secure recovery flows, and real-time GitHub integration.

The system supports three stakeholder roles:
- Student
- Group Leader
- System Administrator

## 3.2 Requirements Elicitation Method

The requirements were gathered using the following methods:
1. **Structured Interview**: Conducted with a university student to identify background experiences, common bottlenecks in group projects, and both functional and non-functional expectations.
2. **Team Brainstorming**: A collaborative session to refine identified needs and expand the system scope to include technical integrations like GitHub.
3. **Categorization**: Extracted requirements were categorized into functional and non-functional specifications to guide the development phases.

## 2. System Design and Architecture

The application follows a modular Client-Server architecture:

- `HTML` was used to build separate pages for each main system function.
- `CSS` was used to provide a consistent visual design, responsive layout, cards, forms, and dashboard styling.
- `JavaScript` was split into reusable modules for storage, authentication, group management, task management, dashboard calculations, administrator features, and shared UI helpers.
- `Flask (Python)` serves as the API layer, handling business logic, email notifications, and GitHub synchronization.
- `SQLite` provides persistent storage for users, groups, tasks, and progress logs.

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

1.1 **Registration**: Users can register and create a personal account.
1.2 **Profile Customization**: Users can upload or set a profile picture and link GitHub usernames.
1.3 **Authentication**: Secure login and logout functionality, supported by a session management system.

### 3.2 Group Management

2.1 **Group Creation**: Users can create groups, automatically becoming the Group Leader.
2.2 **Joining**: Users join existing groups via unique invite codes.
2.3 **Role Management**: Group Leaders can manage member roles (Leader, Editor, Member) and permissions.

### 3.3 Task Management

3.1 - 3.4 **CRUD Operations**: Authorized users can create, assign, modify, and delete tasks containing descriptions, categories, deadlines, and status.
3.5 - 3.6 **Task Types**: Support for deadline-based tasks and read-only reminders with progress reporting.
3.7 - 3.8 **Unified Feed**: Personal and group tasks are displayed in a unified main feed.
3.9 **Complexity Sizing**: Group Leaders assign 'Complexity Sizes' (XS to XL) to tasks, mapped to predefined Line of Code (LoC) ranges.
3.10 - 3.11 **GitHub Integration**: Tasks can be linked to GitHub branches. The system autonomously fetches commit data to update 'Actual LoC'.

### 3.4 Dashboard and Progress Monitoring

4.1 - 4.3 **Visualization**: Dashboards display metrics for completed, pending, and ongoing tasks.
4.4 **LoC Progress**: Completion percentage is calculated by comparing actual LoC pushed to GitHub against the median value of the assigned size range.
4.5 **Efficiency Alerts**: The system generates alerts if code output significantly exceeds the expected complexity range.

### 3.5 System Administration

5.1 **Account Management**: Administrators can activate, deactivate, or manage user accounts.
5.2 **Performance Monitoring**: Oversight of system-wide metrics and task flow.
5.3 **Backup**: Ability to perform data backup operations via JSON export.

## 3.4 Non-Functional Requirements

### 1. Performance
1.1 **Responsiveness**: The system responds to user actions within 2 seconds.
1.2 **Concurrency**: Supports multiple users without performance degradation.
1.3 **Synchronization**: GitHub API integration synchronizes data every 5 minutes.

### 2. Security
2.1 - 2.3 **Access Control**: Role-based access ensures group data is accessible only to authorized members and protects user data.
2.4 **Token Security**: (Planned) GitHub Personal Access Tokens will be stored using encryption.

### 3. Reliability
3.1 - 3.2 **Persistence**: Data is stored persistently in SQLite to prevent loss and ensure consistent behavior.

## 4. Non-Functional Considerations

Although this project is a prototype, several non-functional requirements were considered during implementation:

### Performance
- The app is lightweight because it uses static front-end files only.
- All data operations are fast because they are performed directly in the browser.

### Security
- Basic role-based access logic is enforced in the interface.
- Different pages and actions are restricted depending on user type.
- The system uses CORS protection to restrict API access to trusted origins.

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

The current implementation focuses on the core functional requirements for academic group projects. Current limitations include:
- **Encryption**: Requirement 2.4 (GitHub Token Encryption) is planned for the next security iteration.
- **Database Migrations**: Manual schema management is required via `init_db.py`.
- **Analytics**: System performance monitoring uses high-level aggregated metrics rather than deep logging.


## 7. Future Improvements

Possible future enhancements include:

- Implementing secure password hashing (e.g., Argon2 or bcrypt).
- Transitioning from manual LoC entry to fully automated GitHub Webhooks.
- adding notifications and real-time collaboration
- expanding analytics and reporting
- adding calendar views and richer charts

## 8. Conclusion

The implemented system successfully demonstrates the main functions required for managing student group projects. It provides a structured workflow for creating groups, assigning tasks, tracking progress, and managing users. The modular design and clean interface make it a suitable semester-project prototype and a strong foundation for future full-stack development.
