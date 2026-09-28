// tests/markdown-parser.test.js
import { describe, it, expect } from 'vitest';
import { MarkdownParser } from '../src/js/intelligence/markdown-parser.js';

describe('MarkdownParser', () => {
    it('debe convertir Markdown a HTML', () => {
        const html = MarkdownParser.toHTML('# Título\n\n**Negrita** y *cursiva*');
        expect(html).toContain('<h1>Título</h1>');
        expect(html).toContain('<strong>Negrita</strong>');
        expect(html).toContain('<em>cursiva</em>');
    });

    it('debe convertir HTML a Markdown', () => {
        const md = MarkdownParser.toMarkdown('<h1>Título</h1><p><strong>Negrita</strong></p>');
        expect(md).toContain('# Título');
        expect(md).toContain('**Negrita**');
    });

    it('debe manejar listas', () => {
        const html = MarkdownParser.toHTML('- Uno\n- Dos\n- Tres');
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>Uno</li>');
    });

    it('debe manejar blockquotes', () => {
        const html = MarkdownParser.toHTML('> Cita importante');
        expect(html).toContain('<blockquote>');
    });

    it('debe manejar links', () => {
        const html = MarkdownParser.toHTML('[Google](https://google.com)');
        expect(html).toContain('<a href="https://google.com">Google</a>');
    });

    it('debe manejar strings vacíos', () => {
        expect(MarkdownParser.toHTML('')).toBe('');
        expect(MarkdownParser.toMarkdown('')).toBe('');
    });

    it('debe manejar HTML con listas ordenadas', () => {
        const md = MarkdownParser.toMarkdown('<ol><li>Uno</li><li>Dos</li></ol>');
        expect(md).toContain('1. Uno');
        expect(md).toContain('2. Dos');
    });

    it('debe escapar HTML en la conversión a HTML', () => {
		const html = MarkdownParser.toHTML('<script>alert(1)</script>');
		// No debe haber tags HTML ejecutables
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('</script>');
		// Debe estar escapado
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&lt;/script&gt;');
	});
	it('debe manejar blockquotes multilínea', () => {
		const md = '> Línea 1\n> Línea 2\n> Línea 3';
		const html = MarkdownParser.toHTML(md);
		expect(html).toContain('<blockquote>');
		expect(html).toContain('Línea 1');
		expect(html).toContain('Línea 3');
	});

	it('debe manejar un documento mixto completo', () => {
		const md = `# Título
		
	Párrafo con **negrita** y *cursiva*.

	> Una cita importante

	- Item 1
	- Item 2

	\`\`\`javascript
	const x = 1;
	\`\`\``;
		const html = MarkdownParser.toHTML(md);
		expect(html).toContain('<h1>Título</h1>');
		expect(html).toContain('<strong>negrita</strong>');
		expect(html).toContain('<em>cursiva</em>');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<ul>');
		expect(html).toContain('<pre><code class="language-javascript">');
	});
	// tests/markdown-parser.test.js (añadir al final del describe)

	// ===== COBERTURA ADICIONAL toMarkdown =====

	it('debe convertir HTML con imágenes a Markdown', () => {
		const md = MarkdownParser.toMarkdown('<img alt="logo" src="https://example.com/logo.png">');
		expect(md).toContain('![logo](https://example.com/logo.png)');
	});

	it('debe convertir HTML con código inline a Markdown', () => {
		const md = MarkdownParser.toMarkdown('<p>Usa <code>npm install</code> para instalar</p>');
		expect(md).toContain('`npm install`');
	});

	it('debe convertir HTML con bloques de código a Markdown', () => {
		const md = MarkdownParser.toMarkdown('<pre><code>const x = 1;</code></pre>');
		expect(md).toContain('```');
		expect(md).toContain('const x = 1;');
	});

	it('debe convertir HTML con blockquote a Markdown', () => {
		const md = MarkdownParser.toMarkdown('<blockquote>Una cita importante</blockquote>');
		expect(md).toContain('> Una cita importante');
	});

	it('debe convertir HTML con del a Markdown', () => {
		const md = MarkdownParser.toMarkdown('<p>Texto <del>tachado</del> aquí</p>');
		expect(md).toContain('~~tachado~~');
	});

	it('debe convertir HTML con headers h2-h6 a Markdown', () => {
		expect(MarkdownParser.toMarkdown('<h2>H2</h2>')).toContain('## H2');
		expect(MarkdownParser.toMarkdown('<h3>H3</h3>')).toContain('### H3');
		expect(MarkdownParser.toMarkdown('<h4>H4</h4>')).toContain('#### H4');
		expect(MarkdownParser.toMarkdown('<h5>H5</h5>')).toContain('##### H5');
		expect(MarkdownParser.toMarkdown('<h6>H6</h6>')).toContain('###### H6');
	});

	it('debe convertir HTML con <br> a Markdown', () => {
		const md = MarkdownParser.toMarkdown('<p>Línea 1<br>Línea 2</p>');
		expect(md).toContain('Línea 1');
		expect(md).toContain('Línea 2');
	});

	// ===== COBERTURA ADICIONAL toHTML =====

	it('debe convertir Markdown con headers h4-h6 a HTML', () => {
		expect(MarkdownParser.toHTML('#### H4')).toContain('<h4>H4</h4>');
		expect(MarkdownParser.toHTML('##### H5')).toContain('<h5>H5</h5>');
		expect(MarkdownParser.toHTML('###### H6')).toContain('<h6>H6</h6>');
	});

	it('debe convertir Markdown con código inline', () => {
		const html = MarkdownParser.toHTML('Usa `npm install` para instalar');
		expect(html).toContain('<code>npm install</code>');
	});

	it('debe convertir Markdown con imágenes', () => {
		const html = MarkdownParser.toHTML('![logo](https://example.com/logo.png)');
		expect(html).toContain('<img');
		expect(html).toContain('src="https://example.com/logo.png"');
	});

	it('debe convertir Markdown con tachado', () => {
		const html = MarkdownParser.toHTML('Texto ~~tachado~~ aquí');
		expect(html).toContain('<del>tachado</del>');
	});

	it('debe convertir Markdown con listas ordenadas', () => {
		const md = '1. Primero\n2. Segundo\n3. Tercero';
		const html = MarkdownParser.toHTML(md);
		expect(html).toContain('<ol>');
		expect(html).toContain('<li>Primero</li>');
		expect(html).toContain('<li>Tercero</li>');
	});

	it('debe manejar bloques de código sin lenguaje', () => {
		const md = '```\ncódigo sin lenguaje\n```';
		const html = MarkdownParser.toHTML(md);
		expect(html).toContain('<pre><code>');
		expect(html).toContain('código sin lenguaje');
	});

	it('debe manejar saltos de línea dentro de párrafos', () => {
		const md = 'Línea uno\nLínea dos\nLínea tres';
		const html = MarkdownParser.toHTML(md);
		expect(html).toContain('<br>');
	});

	it('debe manejar guiones bajos para negrita y cursiva', () => {
		const html = MarkdownParser.toHTML('__negrita__ y _cursiva_');
		expect(html).toContain('<strong>negrita</strong>');
		expect(html).toContain('<em>cursiva</em>');
});
});