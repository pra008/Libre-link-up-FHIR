export interface KeycloakClient {
  keycloakEndpoint: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

export interface TokenResponseKeycloak {
    access_token: string;
    token_type: string;
    expires_in: number;
    // Add any other properties returned by the token endpoint here
  }