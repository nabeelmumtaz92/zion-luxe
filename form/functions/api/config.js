import { json } from './_lib.js';

// Public settings for the thank-you page
export const onRequestGet = ({ env }) => json({ calendly: env.CALENDLY_URL || '' });
