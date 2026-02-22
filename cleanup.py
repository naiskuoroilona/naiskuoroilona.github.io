#!/usr/bin/env python3
"""Strip WordPress cruft from downloaded HTML files."""

import os
import re
from html.parser import HTMLParser

HTML_DIR = "/home/inter/workspace/ilona/html"
OUT_DIR = "/home/inter/workspace/ilona/site"

os.makedirs(OUT_DIR, exist_ok=True)

# Map WP page URLs to local filenames
LINK_MAP = {
    "https://naiskuoroilona.wordpress.com": "index.html",
    "https://naiskuoroilona.wordpress.com/": "index.html",
    "https://naiskuoroilona.wordpress.com/galleria/": "galleria.html",
    "https://naiskuoroilona.wordpress.com/ilonasta/": "ilonasta.html",
    "https://naiskuoroilona.wordpress.com/konsertit-ja-esiintymiset/": "konsertit.html",
    "https://naiskuoroilona.wordpress.com/kuoronjohtaja/": "kuoronjohtaja.html",
    "https://naiskuoroilona.wordpress.com/laulajaksi/": "laulajaksi.html",
    "https://naiskuoroilona.wordpress.com/ohjelmisto/": "ohjelmisto.html",
    "https://naiskuoroilona.wordpress.com/tilaa-laulua/": "tilaa-laulua.html",
    "https://naiskuoroilona.wordpress.com/yhteystiedot/": "yhteystiedot.html",
}


def rewrite_links(html):
    """Rewrite internal WP links to local filenames."""
    # Sort by URL length descending so longer/more-specific URLs match first
    for wp_url, local_file in sorted(LINK_MAP.items(), key=lambda x: -len(x[0])):
        html = html.replace(wp_url, local_file)
    return html


def rewrite_images(html):
    """Rewrite WP image URLs to local images/ path."""
    def replace_img(m):
        url = m.group(0)
        # Strip query params
        clean = re.sub(r'\?.*$', '', url)
        filename = clean.rsplit('/', 1)[-1]
        return "images/" + filename

    html = re.sub(
        r'https://naiskuoroilona\.wordpress\.com/wp-content/uploads/[^\s"\'<>)]+',
        replace_img,
        html
    )
    return html


def extract_title(html):
    """Extract <title> text, cleaning any WP URL from it."""
    m = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
    title = m.group(1) if m else "Naiskuoro Ilona"
    # Remove the WP URL that appears in some titles
    title = re.sub(r'\s*\|\s*https?://naiskuoroilona\.wordpress\.com/?', '', title)
    return title


def extract_banner_style(html):
    """Extract the banner background image CSS."""
    m = re.search(r'#title\s*\{[^}]*background:\s*url\(([^)]+)\)', html)
    if m:
        url = m.group(1)
        # Rewrite to local
        clean = re.sub(r'\?.*$', '', url)
        filename = clean.rsplit('/', 1)[-1]
        return f"images/{filename}"
    return None


def extract_body_content(html):
    """Extract the main wrapper content (header + content divs)."""
    # Find the wrapper div
    start = html.find('<div id="wrapper">')
    if start == -1:
        return ""

    # We'll manually extract the relevant parts
    result_parts = []

    # Extract header (banner + nav)
    header_start = html.find('<div id="header"', start)
    header_end = html.find('<!--end header-->', header_start)
    if header_start != -1 and header_end != -1:
        header = html[header_start:header_end + len('<!--end header-->')]
        result_parts.append(header)

    # Extract content
    content_start = html.find('<div id="content"', start)
    content_end = html.find('<!--end content-->', content_start)
    if content_start != -1 and content_end != -1:
        content = html[content_start:content_end + len('<!--end content-->')]
        result_parts.append(content)

    body = '\n'.join(result_parts)
    return body


def strip_wp_elements(html):
    """Remove WP-specific elements from the body content."""
    # Remove ad tags (atatags divs with their script content)
    html = re.sub(r'<div id="atatags-[^"]*">.*?</div>', '', html, flags=re.DOTALL)

    # Remove wordads markers
    html = re.sub(r'<span id="wordads-inline-marker"[^>]*></span>', '', html)

    # Remove share/like buttons (jp-post-flair and everything inside)
    # Greedy removal of the entire jp-post-flair block up to end-entry or end of parent
    html = re.sub(r'<div id="jp-post-flair"[^>]*>.*?(?=</div><!--end entry-->)', '', html, flags=re.DOTALL)
    # Remove any remaining sharedaddy blocks (likes, sharing, etc.)
    html = re.sub(r"<div[^>]*class=['\"][^'\"]*(?:sharedaddy|sd-like|sd-sharing|jetpack-likes|sd-block)[^'\"]*['\"][^>]*>.*?(?=</div><!--end entry-->|$)", '', html, flags=re.DOTALL)

    # Remove comments section
    html = re.sub(r'<div id="comments">.*?<!--end comments-->', '', html, flags=re.DOTALL)

    # Remove any remaining script tags
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)

    # Remove noscript tags
    html = re.sub(r'<noscript>.*?</noscript>', '', html, flags=re.DOTALL)

    # Remove forms
    html = re.sub(r'<form[^>]*>.*?</form>', '', html, flags=re.DOTALL)

    # Remove iframes
    html = re.sub(r'<iframe[^>]*>.*?</iframe>', '', html, flags=re.DOTALL)

    # Remove WP description line showing the URL (handles both original and rewritten URLs)
    html = re.sub(
        r'<div id="description">\s*<h2>[^<]*</h2>\s*</div><!--end description-->',
        '',
        html,
        flags=re.DOTALL
    )

    # Strip WP data-* attributes from images/elements
    html = re.sub(r'\s+data-(?:attachment-id|permalink|orig-file|orig-size|comments-opened|image-meta|image-title|image-description|image-caption|medium-file|large-file)=["\'][^"\']*["\']', '', html)

    # Clean up srcset attributes pointing to WP paths (just remove srcset entirely, local images don't need it)
    html = re.sub(r'\s+srcset=["\'][^"\']*["\']', '', html)

    # Clean up sizes attribute (goes with srcset)
    html = re.sub(r'\s+sizes=["\'][^"\']*["\']', '', html)

    # Remove Jetpack slideshow divs (contain JSON with WP URLs)
    html = re.sub(r'<div[^>]*class="[^"]*jetpack-slideshow[^"]*"[^>]*>.*?</div>', '', html, flags=re.DOTALL)
    html = re.sub(r'<p[^>]*class="[^"]*jetpack-slideshow-noscript[^"]*"[^>]*>.*?</p>', '', html, flags=re.DOTALL)

    # Remove data-gallery and data-carousel-extra attributes (contain JSON with WP URLs)
    html = re.sub(r'\s+data-gallery=["\'][^"\']*["\']', '', html)
    html = re.sub(r"\s+data-carousel-extra='[^']*'", '', html)

    # Remove "You can start editing here" comments
    html = re.sub(r'<!-- You can start editing here.*?-->', '', html)

    # Remove empty paragraphs
    html = re.sub(r'<p>\s*</p>', '', html)

    # Remove StartFragment/EndFragment comments
    html = re.sub(r'<!--StartFragment-->', '', html)
    html = re.sub(r'<!--EndFragment-->', '', html)

    # Remove any remaining WP-specific link tags and references
    html = re.sub(r'<link[^>]*(?:wp\.com|wordpress\.com|pingback|xmlrpc|rsd|openid|opensearch)[^>]*/?\s*>', '', html)

    # Remove links that wrap images (gallery lightbox links, now pointing to images/ or WP)
    html = re.sub(
        r'<a[^>]*href=["\'][^"\']*["\'][^>]*>\s*(<img[^>]*>)\s*</a>',
        r'\1',
        html,
        flags=re.DOTALL
    )

    # Remove any other links to wp.com or wordpress.com
    html = re.sub(r'<a[^>]*href=["\'][^"\']*(?:wp\.com|wordpress\.com)[^"\']*["\'][^>]*>.*?</a>', '', html, flags=re.DOTALL)

    # Remove blog post comment links (we don't have individual post pages)
    html = re.sub(r'<div class="comments"><a[^>]*>.*?</a></div>', '', html, flags=re.DOTALL)

    # Remove category links (WP-specific)
    html = re.sub(r'<div class="categories">.*?</div>', '', html, flags=re.DOTALL)

    # Remove tag links
    html = re.sub(r'<div class="tags">.*?</div>', '', html, flags=re.DOTALL)

    # Fix blog post title links that became broken (index.html2024/...) - just remove the link, keep the text
    html = re.sub(r'<a href="index\.html\d{4}/[^"]*"[^>]*>(.*?)</a>', r'\1', html, flags=re.DOTALL)
    html = re.sub(r'<a href="index\.htmltag/[^"]*"[^>]*>(.*?)</a>', r'\1', html, flags=re.DOTALL)
    html = re.sub(r'<a href="index\.htmlpage/[^"]*"[^>]*>(.*?)</a>', r'\1', html, flags=re.DOTALL)
    html = re.sub(r'<a href="index\.htmlcategory/[^"]*"[^>]*>(.*?)</a>', r'\1', html, flags=re.DOTALL)

    # Remove "Older posts" / "Newer posts" navigation links
    html = re.sub(r'<div class="navigation">.*?</div><!--end navigation-->', '', html, flags=re.DOTALL)

    # Remove comment reply sections ("Jätä kommentti")
    html = re.sub(r'<div id="respond"[^>]*>.*?</div><!-- #respond -->', '', html, flags=re.DOTALL)
    html = re.sub(r'<h3 id="reply-title"[^>]*>.*?</h3>\s*</div><!-- #respond -->', '', html, flags=re.DOTALL)

    # Remove post footer sections (contain comment/category links)
    html = re.sub(r'<div class="post-footer">.*?<!--end post footer-->', '', html, flags=re.DOTALL)

    # Remove pagination ("Vanhemmat artikkelit" etc.)
    html = re.sub(r'<div class="alignleft">.*?</div>\s*<div class="alignright">.*?</div>', '', html, flags=re.DOTALL)

    # Remove leftover data attributes referencing WP
    html = re.sub(r'\s+data-(?:src|name|title)=["\'][^"\']*(?:wp\.com|wordpress\.com)[^"\']*["\']', '', html)

    # Clean up excessive whitespace
    html = re.sub(r'\n{3,}', '\n\n', html)

    return html


def build_clean_page(title, banner_img, body_content):
    """Build a clean HTML page."""
    banner_css = ""
    if banner_img:
        banner_css = f"""
        #title {{
            background: url({banner_img}) no-repeat;
            background-size: cover;
            height: 180px;
        }}
        #title a {{
            display: block;
            height: 180px;
            text-indent: -999em;
        }}"""

    return f"""<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
            margin: 0;
            padding: 0;
            color: #333;
            background: #f5f5f5;
        }}
        #wrapper {{
            max-width: 960px;
            margin: 0 auto;
            background: #fff;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }}
        #header {{
            border-bottom: 1px solid #ddd;
        }}{banner_css}
        #nav ul {{
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-wrap: wrap;
            background: #444;
        }}
        #nav ul li a {{
            display: block;
            padding: 10px 15px;
            color: #fff;
            text-decoration: none;
            font-size: 14px;
        }}
        #nav ul li a:hover,
        #nav ul li.current_page_item a {{
            background: #666;
        }}
        #content {{
            padding: 20px 30px;
        }}
        .pagetitle {{
            font-size: 28px;
            margin-bottom: 20px;
            color: #222;
        }}
        .entry {{
            line-height: 1.6;
        }}
        .entry img {{
            max-width: 100%;
            height: auto;
        }}
        .post {{
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
        }}
        .post h2 a {{
            color: #333;
            text-decoration: none;
        }}
        .post h2 a:hover {{
            color: #0073aa;
        }}
        .postmetadata {{
            color: #888;
            font-size: 13px;
        }}
        .gallery {{
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }}
        .gallery img {{
            max-width: 200px;
            height: auto;
        }}
        a {{
            color: #0073aa;
        }}
        .skip-content {{
            display: none;
        }}
    </style>
</head>
<body>
    <div id="wrapper">
        {body_content}
    </div>
</body>
</html>
"""


def process_file(filename):
    """Process a single HTML file."""
    filepath = os.path.join(HTML_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    title = extract_title(html)
    banner_img = extract_banner_style(html)
    body = extract_body_content(html)
    body = rewrite_images(body)
    body = rewrite_links(body)
    body = strip_wp_elements(body)

    clean = build_clean_page(title, banner_img, body)

    outpath = os.path.join(OUT_DIR, filename)
    with open(outpath, 'w', encoding='utf-8') as f:
        f.write(clean)

    print(f"  {filename}: {len(html)} -> {len(clean)} bytes")


def main():
    # Symlink images into site dir
    images_link = os.path.join(OUT_DIR, "images")
    images_src = os.path.join("/home/inter/workspace/ilona", "images")
    if not os.path.exists(images_link):
        os.symlink(images_src, images_link)

    print("Cleaning HTML files...")
    for f in sorted(os.listdir(HTML_DIR)):
        if f.endswith('.html'):
            process_file(f)
    print("Done! Clean files in:", OUT_DIR)


if __name__ == '__main__':
    main()
