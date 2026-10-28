# C4 Level 2 — Containers (updated for Lab Part 4)

```mermaid
C4Container
    title SuccessfulSuccess — Container diagram

    Person(user, "User", "Meeting owner in the browser")

    Container_Boundary(web, "Frontend") {
        Container(spa, "Next.js SPA", "React / S3+CloudFront", "Today list, forms, Paste an agenda")
    }

    Container_Boundary(aws, "AWS") {
        Container(api, "API Lambda", "FastAPI / VPC", "CRUD meetings, save agenda to Aurora")
        Container(parser, "Agenda parser Lambda", "Python / no VPC", "Cognito + Claude parse → JSON")
        Container(builder, "Report builder", "Python / VPC", "Weekly CSV to S3")
        Container(mailer, "Report mailer", "Python / no VPC", "Email CSV via SES")
        ContainerDb(aurora, "Aurora PostgreSQL", "Serverless v2", "Meetings, agenda, ai_suggestion")
        Container(s3, "S3 reports", "Object storage", "reports/*.csv")
        System_Ext(cognito, "Amazon Cognito", "Sign-in / JWT")
        System_Ext(bedrock, "Amazon Bedrock Mantle", "Claude Messages API")
        System_Ext(ses, "Amazon SES", "Outbound email")
        System_Ext(eb, "EventBridge + SQS", "Monday schedule")
    }

    Rel(user, spa, "HTTPS")
    Rel(spa, cognito, "Sign in")
    Rel(spa, api, "REST + Bearer token", "save agenda, CRUD")
    Rel(spa, parser, "POST paste text", "parse only")
    Rel(parser, cognito, "Verify JWT (JWKS)")
    Rel(parser, bedrock, "record_agenda tool")
    Rel(api, aurora, "SQL")
    Rel(builder, aurora, "SQL")
    Rel(builder, s3, "PutObject via Gateway endpoint")
    Rel(s3, mailer, "ObjectCreated")
    Rel(mailer, ses, "Send raw email")
    Rel(eb, builder, "report request")
```

## Two arrows that matter for Part 4

1. **Parse:** Browser → agenda-parser Function URL → Bedrock → JSON suggestion (no database).
2. **Save:** Browser → API Lambda → Aurora (validated write; stores `ai_suggestion` JSONB).
