REM Required environment variables for the demo
set "DEMO_ENABLED=true"
set "LOG_LEVEL=info"
set "LINK_UP_USERNAME=your_librelinkup_username"
set "LINK_UP_PASSWORD=your_librelinkup_password"
set "LINK_UP_TIME_INTERVAL=5"
set "FHIR_ID=your_fhir_id"
set "FHIR_URL=your_fhir_server_url"
set "TOKEN_ENDPOINT=your_token_endpoint"
set "CLIENT_ID=your_client_id"
set "CLIENT_SECRET=your_client_secret"
set "SCOPE=your_client_scope"

npm install
npm start demo
