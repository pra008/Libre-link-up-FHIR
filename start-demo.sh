#!/bin/bash

# Required environment variables for the demo
export DEMO_ENABLED="true"
export LOG_LEVEL="info"
export LINK_UP_USERNAME="your_librelinkup_username"
export LINK_UP_PASSWORD="your_librelinkup_password"
export LINK_UP_TIME_INTERVAL="5"
export FHIR_ID="your_fhir_id"
export FHIR_URL="your_fhir_server_url"
export TOKEN_ENDPOINT="your_token_endpoint"
export CLIENT_ID="your_client_id"
export CLIENT_SECRET="your_client_secret"
export SCOPE="your_client_scope"

npm install
npm start demo