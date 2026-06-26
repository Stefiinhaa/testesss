import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import DeleteBehaviorField from '../components/DeleteBehaviorField';

jest.mock('../api/apiConfig', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const api = jest.requireMock('../api/apiConfig').default;

describe('DeleteBehaviorField', () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  test('mostra botão de apagar quando o backend permitir exclusão total', async () => {
    const onDelete = jest.fn();
    api.get.mockResolvedValue({
      data: {
        action: 'delete',
        confirmation_message: 'Apagar este registro definitivamente?',
      },
    });

    render(
      <DeleteBehaviorField
        placement="toolbar"
        resourcePath="/interesses"
        entityId="int-1"
        active
        onActiveChange={jest.fn()}
        onDelete={onDelete}
      />
    );

    const button = await screen.findByRole('button', { name: 'Apagar' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText('Apagar este registro definitivamente?')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete' }));
  });

  test('mantém checkbox de ativo quando houver dependências bloqueando a remoção total', async () => {
    const onActiveChange = jest.fn();
    api.get.mockResolvedValue({
      data: {
        action: 'deactivate',
        confirmation_message: 'Este registro possui 2 dependência(s) ativa(s) e será apenas inativado.',
      },
    });

    render(
      <DeleteBehaviorField
        resourcePath="/turmas"
        entityId="turma-1"
        active
        onActiveChange={onActiveChange}
        onDelete={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onActiveChange).toHaveBeenCalledWith(false);

    // A mensagem de confirmação NÃO deve aparecer em placement="field"
    expect(screen.queryByText('Este registro possui 2 dependência(s) ativa(s) e será apenas inativado.')).not.toBeInTheDocument();
  });

  test('exibe checkbox ativo no campo sem mensagem de confirmação mesmo com dependências', async () => {
    const onActiveChange = jest.fn();
    api.get.mockResolvedValue({
      data: {
        action: 'deactivate',
        confirmation_message: 'Bloqueado para exclusão total; apenas inativado.',
      },
    });

    render(
      <DeleteBehaviorField
        resourcePath="/interesses"
        entityId="int-2"
        active
        onActiveChange={onActiveChange}
        onDelete={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    // A mensagem de confirmação NÃO deve aparecer em placement="field"
    expect(screen.queryByText('Bloqueado para exclusão total; apenas inativado.')).not.toBeInTheDocument();
  });
});
