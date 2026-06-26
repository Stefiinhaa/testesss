import { render } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

describe('Acesso externo às páginas públicas', () => {
	const pages = [
		{ name: 'login', file: 'index.html', selector: '#root' },
		{ name: 'registro', file: 'register.html', selector: 'form' },
		{ name: 'recuperação de senha', file: 'forgot-password.html', selector: 'form' }
	];

	pages.forEach(({ name, file, selector }) => {
		it(`deve renderizar a página de ${name} sem erros de layout`, () => {
			const html = fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');
			const { container } = render(<div dangerouslySetInnerHTML={{ __html: html }} />);
			expect(container.querySelector(selector)).toBeTruthy();
			// Verifica se não há elementos com classe de erro de layout
			expect(container.querySelector('.layout-error')).toBeFalsy();
		});
	});
});
