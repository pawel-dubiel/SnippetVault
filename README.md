# Snippet Manager

Browser extension that saves selected text snippets and lets you search them with fuzzy matching powered by a local Fuse.js bundle.

## Features
- Save selected text from any page using the context menu.
- Add snippets manually from the popup.
- View, copy, delete, and move snippets between local and synced storage in the popup.
- Fuzzy search across snippet text and URL using Fuse.js (no network calls at runtime).

## How It Works
- **Background**: stores snippets in `chrome.storage.local` (default) and triggers the flying animation.
- **Popup**: loads snippets and filters results using a local Fuse.js index across local and synced storage.

## Data Storage
- Snippets (local tab): `chrome.storage.local`
- Snippets (synced tab): `chrome.storage.sync` (quota-limited)

## Load the Extension
1. Open `chrome://extensions`
2. Enable Developer mode.
3. Click "Load unpacked" and select this project directory.
