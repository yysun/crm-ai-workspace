The endpoints this workflow still needs are now documented in daily-triage.md. The minimum useful additions are:

GET /api/data/notes with server-side date, author, team, object, type, and pagination filters.
POST /api/data/notes/search for compound note queries.
POST /api/data/objects/batchGet to avoid N+1 account/contact hydration.
GET /api/data/notes/{id}/objects for normalized note-to-object links.
GET /api/data/notes/due for structured “needs attention today” follow-up.
GET /api/data/teams/{teamId}/notes for true team-wide briefing.
Optional account and contact summary endpoints for lighter-weight hydration.