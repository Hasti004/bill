# Travel Expense Management System

A comprehensive web application for managing company travel expenses with role-based access control, approval workflows, and audit logging.
s
## 🚀 Features

### Core Functionality
- **Admin-only user creation** - Only administrators can create new user accounts
- **Expense draft/submit flow** - Employees can create drafts and submit for review
- **Assign→Verify→Approve lifecycle** - Engineers verify, admins approve expenses
- **File upload validation** - PDF, PNG, JPG files ≤10MB with proper validation
- **Role-based access control (RBAC)** - Admin, Engineer, Employee roles with proper permissions
- **Comprehensive audit logging** - All actions tracked for compliance
- **Backend total computation** - Automatic calculation of expense totals

### User Roles
- **Admin**: Full system access, user management, expense approval
- **Engineer**: Review and verify assigned expenses, add comments
- **Employee**: Create and submit expense claims, view own expenses

### Expense Workflow
1. **Draft** → Employee creates expense with line items
2. **Submitted** → Employee submits for review
3. **Under Review** → Admin assigns to engineer (optional)
4. **Verified** → Engineer verifies expenses
5. **Approved/Rejected** → Admin makes final decision
6. **Paid** → Accounting processes payment

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI Components**: shadcn/ui, Tailwind CSS
- **State Management**: React Context API, TanStack Query
- **Routing**: React Router DOM v6
- **Forms**: React Hook Form with Zod validation
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Testing**: Vitest, Testing Library
- **Icons**: Lucide React
- **Charts**: Recharts

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Git

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd voyage-account
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env.local` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Database Setup

Run the Supabase migrations to set up the database schema:

```bash
# If you have Supabase CLI installed
supabase db reset

# Or manually run the migration file:
# supabase/migrations/20251005171552_6159c659-1917-425b-813e-9ef879ba396e.sql
```

### 5. Create Initial Admin User

Since only admins can create users, you'll need to manually create the first admin user in Supabase:

1. Go to your Supabase dashboard
2. Navigate to Authentication → Users
3. Create a new user
4. Go to SQL Editor and run:

```sql
-- Replace 'user-id-here' with the actual user ID from auth.users
INSERT INTO public.user_roles (user_id, role) 
VALUES ('user-id-here', 'admin');
```

### 6. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Test Structure

- **Unit Tests**: `src/services/__tests__/` - Test business logic
- **Integration Tests**: `src/__tests__/integration/` - Test component interactions
- **Test Setup**: `src/test/setup.ts` - Mock configurations

## 📚 API Documentation

The API is documented using OpenAPI 3.0 specification. View the complete documentation:

- **OpenAPI Spec**: `docs/openapi.yaml`
- **API Endpoints**: All Supabase RPC functions and REST endpoints
- **Authentication**: JWT-based authentication via Supabase Auth
- **File Upload**: Multipart form data for receipt attachments

### Key API Endpoints

- `POST /auth/login` - User authentication
- `POST /expenses` - Create expense
- `POST /expenses/{id}/submit` - Submit expense
- `POST /expenses/{id}/verify` - Engineer verification
- `POST /expenses/{id}/approve` - Admin approval
- `POST /expenses/{id}/attachments` - Upload receipts

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── AppSidebar.tsx  # Navigation sidebar
│   ├── FileUpload.tsx  # File upload component
│   └── ...
├── contexts/           # React contexts
│   └── AuthContext.tsx # Authentication context
├── hooks/             # Custom React hooks
├── integrations/      # External service integrations
│   └── supabase/      # Supabase client and types
├── pages/             # Page components
│   ├── Auth.tsx       # Login page
│   ├── Dashboard.tsx  # User dashboard
│   ├── ExpenseForm.tsx # Create/edit expenses
│   ├── AdminPanel.tsx # Admin management
│   ├── EngineerReview.tsx # Engineer verification
│   └── ...
├── services/          # Business logic services
│   └── ExpenseService.ts # Expense management logic
├── test/             # Test utilities and setup
└── lib/              # Utility functions
```

## 🔒 Security Features

### Authentication & Authorization
- JWT-based authentication via Supabase Auth
- Role-based access control (RBAC)
- Row Level Security (RLS) policies in PostgreSQL
- Protected routes with role validation

### Data Validation
- Frontend validation with Zod schemas
- Backend validation in Supabase functions
- File type and size validation
- Input sanitization

### Audit Trail
- All user actions logged in `audit_logs` table
- Timestamp and user tracking
- Action-specific comments
- Immutable audit records

## 📁 File Upload

### Supported Formats
- **PDF**: `.pdf`
- **Images**: `.png`, `.jpg`, `.jpeg`

### Validation Rules
- Maximum file size: 10MB
- File type validation on both frontend and backend
- Secure file storage in Supabase Storage
- Public URL generation for file access

## 🚀 Deployment

### Production Build

```bash
npm run build
```

### Environment Variables

Set these environment variables in your production environment:

```env
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_supabase_anon_key
```

### Supabase Configuration

1. Enable Row Level Security on all tables
2. Configure storage policies for file uploads
3. Set up proper CORS policies
4. Configure email templates for user invitations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Use conventional commit messages
- Ensure all tests pass before submitting PR

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the [API documentation](docs/openapi.yaml)
- Review the test files for usage examples

## 🔄 Recent Updates

### v1.0.0 - Complete Expense Flow Implementation
- ✅ Admin-only user creation with proper validation
- ✅ Complete expense draft/submit workflow
- ✅ Engineer verification and admin approval process
- ✅ File upload with PDF/JPG/PNG validation (≤10MB)
- ✅ Comprehensive RBAC with backend validation
- ✅ Full audit logging for all actions
- ✅ Backend total computation for expenses
- ✅ Unit and integration test coverage
- ✅ OpenAPI documentation
- ✅ Updated README with setup instructions

---

**Note**: This is a Supabase-based application, not Next.js/Express/Prisma as mentioned in some specifications. The implementation uses Supabase's built-in authentication, database, and storage services for a complete backend solution.

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
