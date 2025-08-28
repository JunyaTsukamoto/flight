// flight-map/src/api.js
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

export const endpoints = {
    airports: `${API_BASE}/airports`,
    flights: `${API_BASE}/flights`,
};

export default endpoints;
