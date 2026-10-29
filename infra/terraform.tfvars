project_name = "successfulsuccess"
region       = "us-east-1"

app_urls = [
  "http://localhost:3000/",
  "https://d1f03icpsr7l8b.cloudfront.net/",
]

google_client_id = "78527588947-ljs9qtoftp0k2hvep0ft4913nckrqb77.apps.googleusercontent.com"

# Secrets: set via TF_VAR_google_client_secret / TF_VAR_database_url or HCP workspace.
# Do not commit real secrets here.

budget_alert_email = "a.kravchenko.pn@ucu.edu.ua"
report_recipients  = "a.kravchenko.pn@ucu.edu.ua"
sender_email       = "a.kravchenko.pn@ucu.edu.ua"

parser_model = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
architecture = "x86_64"
app_timezone = "Europe/Kyiv"

schedule_expression = "cron(0 7 ? * MON *)"
schedule_timezone   = "Europe/Kyiv"

subnet_route_table_ids = ["rtb-08c613cf74764d44b"]
