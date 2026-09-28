// src/js/intelligence/markdown-parser.js
/**
 * Conversor Markdown ↔ HTML ↔ JSON.
 */
export class MarkdownParser {
    static toHTML(md) {
		if (!md) return '';
		
		const lines = md.replace(/\r\n/g, '\n').split('\n');
		const blocks = [];
		let i = 0;
		let paragraphBuffer = [];
		
		const flushParagraph = () => {
			if (paragraphBuffer.length > 0) {
				const text = paragraphBuffer.join('\n');
				blocks.push({ type: 'paragraph', content: text });
				paragraphBuffer = [];
			}
		};
		
		while (i < lines.length) {
			const line = lines[i];
			const trimmed = line.trim();  // 🆕 Normalizar
			
			// Bloque de código ```
			if (trimmed.startsWith('```')) {
				flushParagraph();
				const lang = trimmed.slice(3);
				const codeLines = [];
				i++;
				while (i < lines.length && !lines[i].trim().startsWith('```')) {
					codeLines.push(lines[i]);
					i++;
				}
				blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
				i++;
				continue;
			}
			
			// Header (# a ######) - permite indentación
			const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
			if (headerMatch) {
				flushParagraph();
				blocks.push({
					type: 'header',
					level: headerMatch[1].length,
					content: headerMatch[2].trim()
				});
				i++;
				continue;
			}
			
			// Blockquote (>) - permite indentación
			if (trimmed.startsWith('>')) {
				flushParagraph();
				const quoteLines = [];
				while (i < lines.length && lines[i].trim().startsWith('>')) {
					quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
					i++;
				}
				blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
				continue;
			}
			
			// Lista no ordenada (-, *, +) - permite indentación
			if (/^\s*[-*+]\s+/.test(line)) {
				flushParagraph();
				const items = [];
				while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
					items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
					i++;
				}
				blocks.push({ type: 'ul', items });
				continue;
			}
			
			// Lista ordenada (1., 2., ...) - permite indentación
			if (/^\s*\d+\.\s+/.test(line)) {
				flushParagraph();
				const items = [];
				while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
					items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
					i++;
				}
				blocks.push({ type: 'ol', items });
				continue;
			}
			
			// Línea vacía
			if (trimmed === '') {
				flushParagraph();
				i++;
				continue;
			}
			
			// Párrafo normal - preservar contenido pero sin indentación excesiva
			paragraphBuffer.push(trimmed);  // 🆕 trim() para quitar indentación
			i++;
		}
		flushParagraph();
		
		return blocks.map(block => this._renderBlock(block)).join('\n');
}

	/**
	 * Renderiza un bloque a HTML.
	 * @private
	 */
	static _renderBlock(block) {
		switch (block.type) {
			case 'header':
				return `<h${block.level}>${this._renderInline(block.content)}</h${block.level}>`;
			
			case 'paragraph':
				return `<p>${this._renderInline(block.content).replace(/\n/g, '<br>')}</p>`;
			
			case 'blockquote':
				return `<blockquote>${this._renderInline(block.content)}</blockquote>`;
			
			case 'ul':
				return `<ul>${block.items.map(item => `<li>${this._renderInline(item)}</li>`).join('')}</ul>`;
			
			case 'ol':
				return `<ol>${block.items.map(item => `<li>${this._renderInline(item)}</li>`).join('')}</ol>`;
			
			case 'code':
				const langClass = block.lang ? ` class="language-${block.lang}"` : '';
				return `<pre><code${langClass}>${this._escape(block.content)}</code></pre>`;
			
			default:
				return '';
		}
	}

	/**
	 * Renderiza elementos inline (negrita, cursiva, links, etc.).
	 * Escapa el HTML del usuario para prevenir XSS.
	 * @private
	 */
	static _renderInline(text) {
		// 1. Escapar HTML primero
		let html = this._escape(text);
		
		// 2. Aplicar elementos inline
		// Código inline (antes de negrita para evitar conflictos)
		html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
		
		// Imágenes ![alt](url)
		html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
		
		// Links [text](url)
		html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
		
		// Negrita **text** o __text__
		html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
		
		// Cursiva *text* o _text_
		html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
		html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
		
		// Tachado ~~text~~
		html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
		
		return html;
	}

    static toMarkdown(html) {
        if (!html) return '';
        const div = document.createElement('div');
        div.innerHTML = html;
        return this._nodeToMd(div).trim();
    }

    static _nodeToMd(node) {
        let result = '';
        for (const child of node.childNodes) {
            if (child.nodeType === 3) {
                result += child.textContent;
            } else if (child.nodeType === 1) {
                const tag = child.tagName.toLowerCase();
                const inner = this._nodeToMd(child);
                switch (tag) {
                    case 'h1': result += `\n# ${inner}\n`; break;
                    case 'h2': result += `\n## ${inner}\n`; break;
                    case 'h3': result += `\n### ${inner}\n`; break;
                    case 'h4': result += `\n#### ${inner}\n`; break;
                    case 'h5': result += `\n##### ${inner}\n`; break;
                    case 'h6': result += `\n###### ${inner}\n`; break;
                    case 'p': result += `\n${inner}\n`; break;
                    case 'br': result += '\n'; break;
                    case 'strong':
                    case 'b': result += `**${inner}**`; break;
                    case 'em':
                    case 'i': result += `*${inner}*`; break;
                    case 'del':
                    case 's': result += `~~${inner}~~`; break;
                    case 'code':
                        if (child.parentNode.tagName.toLowerCase() === 'pre') {
                            result += inner;
                        } else {
                            result += `\`${inner}\``;
                        }
                        break;
                    case 'pre': result += `\n\`\`\`\n${inner}\n\`\`\`\n`; break;
                    case 'blockquote': result += `\n> ${inner}\n`; break;
                    case 'a': result += `[${inner}](${child.href})`; break;
                    case 'img': result += `![${child.alt}](${child.src})`; break;
                    case 'ul':
                        result += '\n';
                        for (const li of child.children) {
                            result += `- ${this._nodeToMd(li)}\n`;
                        }
                        break;
                    case 'ol':
                        result += '\n';
                        let i = 1;
                        for (const li of child.children) {
                            result += `${i++}. ${this._nodeToMd(li)}\n`;
                        }
                        break;
                    case 'li': result += inner; break;
                    default: result += inner;
                }
            }
        }
        return result;
    }

    static _escape(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}