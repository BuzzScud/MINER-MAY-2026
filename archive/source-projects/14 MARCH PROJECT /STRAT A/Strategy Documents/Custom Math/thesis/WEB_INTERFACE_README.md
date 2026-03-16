# Interactive Thesis Web Interface

## Overview

A beautiful, interactive web interface for browsing and searching the Crystalline Mathematics thesis.

## Features

### 📖 Interactive Navigation
- Hierarchical tree view of all parts and chapters
- Expandable/collapsible sections
- Click to load any chapter instantly

### 🔍 Full-Text Search
- Search across all chapters and sections
- Instant results with context
- Highlighted matches
- Click results to jump to content

### ✨ Beautiful Rendering
- Markdown content rendered with proper formatting
- Syntax highlighting for code blocks
- Responsive design for all devices
- Smooth animations and transitions

### 📊 Statistics Dashboard
- Total chapters and parts
- Total lines of content
- File sizes
- Real-time updates

## Installation

### Requirements
- PHP 7.0 or higher
- Web server (Apache, Nginx, or PHP built-in server)

### Quick Start

#### Option 1: PHP Built-in Server (Easiest)

```bash
cd thesis
php -S localhost:8000
```

Then open: http://localhost:8000

#### Option 2: Apache/Nginx

1. Point your web server document root to the `thesis/` directory
2. Ensure PHP is enabled
3. Access via your web server URL

### Configuration

The API automatically scans the thesis directory structure. No configuration needed!

## File Structure

```
thesis/
├── index.html              # Main web interface
├── api/
│   └── thesis.php         # REST API backend
├── part_01_*/             # Thesis parts
├── part_02_*/
└── ...
```

## API Endpoints

### Get Structure
```
GET api/thesis.php?action=structure
```
Returns the complete directory structure.

### Get Content
```
GET api/thesis.php?action=content&path=part_01.../content.md
```
Returns the content of a specific file.

### Search
```
GET api/thesis.php?action=search&query=duality
```
Searches all content for the query string.

### Get Statistics
```
GET api/thesis.php?action=stats
```
Returns statistics about the thesis.

## Usage

### Browsing
1. Open the web interface
2. Click on any part or chapter in the sidebar
3. Content loads instantly in the main area

### Searching
1. Type your search query in the search bar (min 3 characters)
2. Press Enter or click Search
3. Click any result to view the full content

### Navigation
- Use the sidebar tree to browse structure
- Click expand icons (▶) to show/hide sections
- Scroll to top button appears when scrolling down

## Features in Detail

### Markdown Rendering
- Headers (H1-H6) with proper styling
- Code blocks with syntax highlighting
- Tables with alternating row colors
- Blockquotes with left border
- Lists (ordered and unordered)
- Links with hover effects
- Inline code formatting

### Responsive Design
- Desktop: Sidebar + content side-by-side
- Mobile: Stacked layout
- Touch-friendly interface
- Smooth scrolling

### Performance
- Lazy loading of content
- Efficient tree rendering
- Fast search with context
- Minimal API calls

## Customization

### Styling
Edit the CSS variables in `index.html`:

```css
:root {
    --primary: #2c3e50;      /* Primary color */
    --secondary: #3498db;    /* Secondary color */
    --accent: #e74c3c;       /* Accent color */
    --success: #27ae60;      /* Success color */
}
```

### API URL
Change the API URL in `index.html`:

```javascript
const API_URL = 'api/thesis.php';  // Change if needed
```

## Security

The API includes security measures:
- Path validation to prevent directory traversal
- Only serves .md files from thesis directory
- CORS headers for cross-origin requests
- Input sanitization

## Troubleshooting

### Content not loading
- Check PHP is running
- Verify file permissions (readable)
- Check browser console for errors

### Search not working
- Ensure query is at least 3 characters
- Check API endpoint is accessible
- Verify PHP has read permissions

### Styling issues
- Clear browser cache
- Check browser console for errors
- Verify marked.js CDN is accessible

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support

## Performance Tips

1. **For large thesis:**
   - Consider adding pagination
   - Implement virtual scrolling for tree
   - Add content caching

2. **For production:**
   - Minify CSS/JS
   - Enable gzip compression
   - Add CDN for assets
   - Implement service worker for offline access

## Future Enhancements

Potential additions:
- [ ] PDF export of chapters
- [ ] Bookmarking system
- [ ] Reading progress tracking
- [ ] Dark mode toggle
- [ ] Print-friendly view
- [ ] Table of contents generation
- [ ] Cross-reference linking
- [ ] Annotation system
- [ ] Share links to specific sections

## License

Part of the Crystalline Mathematics thesis project.

## Support

For issues or questions, refer to the main thesis repository.

---

**Enjoy exploring the thesis!** 📚✨