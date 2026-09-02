# AI Business Email Assistant - Backend

## Phase 3 Complete

This backend now includes advanced features:
- AI task auto-detection
- Email structure analysis
- **Action item extraction with detailed task tracking**
- Context-aware email generation
- Enhanced prompt engineering for natural business communication

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Add your Claude API key to `.env`:
```
ANTHROPIC_API_KEY=your_actual_api_key
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Security Features

- API key stored only in backend environment variables
- No data persistence (emails are not saved)
- Rate limiting (100 requests per hour per IP)
- Input validation and length limits
- Minimal logging (no email content in logs)
- CORS configured for local development

## API Endpoints

### POST /api/email/generate
Generate a new email based on user input with language, tone, and length options.

### POST /api/email/smart-generate
Automatically detect context and generate appropriate email without explicit options.

### POST /api/email/reply
Generate a reply to an existing email.

### POST /api/email/grammar
Check and improve grammar, spelling, and style of English emails.

### POST /api/email/summarize
Analyze and summarize emails with key points, action items, and deadlines.

### POST /api/email/regenerate
Regenerate an email with a different tone.

### POST /api/email/auto-detect
Analyze user input to determine task type, language, and suggested tone.

### POST /api/email/analyze
Perform deep structural analysis of email context, relationships, and business implications.

### POST /api/email/extract-actions ⭐ NEW
Extract detailed action items from emails including:
- Task descriptions
- Assignees (sender/recipient/team/specific person)
- Deadlines and timeframes
- Priority levels (critical/high/medium/low)
- Status tracking (requested/committed/pending/in-progress)
- Dependencies and prerequisites
- Expected deliverables
- Commitments made by sender
- Requests made to recipient
- Decisions needed

### GET /health
Health check endpoint.

## Phase 3 Features

### AI Task Auto-Detection
- Automatically identifies what the user wants to do
- Suggests appropriate tone and language
- Provides confidence level for recommendations

### Email Structure Analysis
- Analyzes relationship dynamics (superior/peer/subordinate/client/vendor)
- Identifies urgency and priority levels
- Detects emotional tone and intensity
- Extracts business context, deadlines, and risks
- Determines response requirements and timeframes

### Action Item Extraction ⭐ NEW
- Comprehensive task extraction from emails
- Detailed tracking of who, what, when, and how
- Priority and status classification
- Dependency mapping
- Commitment and request identification
- Decision point extraction
- Follow-up date suggestions

### Enhanced Business Email Agent
- Context-aware email generation
- Cultural and relationship-appropriate communication
- Natural language that matches business conventions
- Korean honorifics and formality handling
- Professional English appropriate for international business# bnemadie
