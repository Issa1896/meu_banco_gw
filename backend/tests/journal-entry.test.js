const mongoose = require('mongoose');
const JournalEntry = require('../src/models/JournalEntry');

const A = `user:${new mongoose.Types.ObjectId()}`;
const B = `user:${new mongoose.Types.ObjectId()}`;
const make = (lines) => new JournalEntry({ journalRef: `J-${Math.random()}`, type: 'transfer', lines });

describe('regras das partidas dobradas', () => {
  test('lançamento balanceado é válido', () => {
    const e = make([{ account: A, debit: 1010 }, { account: B, credit: 1000 }, { account: 'system:fees', credit: 10 }]);
    expect(e.validateSync()).toBeUndefined();
  });

  test.each([
    ['desbalanceado', [{ account: A, debit: 1010 }, { account: B, credit: 1000 }], /desbalanceado/],
    ['uma linha só', [{ account: A, debit: 10 }], /pelo menos 2/],
    ['débito e crédito na mesma linha', [{ account: A, debit: 10, credit: 10 }, { account: B, credit: 0, debit: 0 }], /débito OU crédito/],
    ['valor não inteiro', [{ account: A, debit: 10.5 }, { account: B, credit: 10.5 }], /inteiro/],
    ['valor negativo', [{ account: A, debit: -10 }, { account: B, credit: -10 }], /./],
    ['conta inexistente', [{ account: 'system:cofre-secreto', debit: 10 }, { account: B, credit: 10 }], /./],
  ])('%s é recusado', (_, lines, msg) => {
    const err = make(lines).validateSync();
    expect(err).toBeDefined();
    expect(err.message).toMatch(msg);
  });
});

describe('imutabilidade', () => {
  test.each(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'])(
    '%s é bloqueado',
    async (op) => {
      await expect(JournalEntry[op]({}, { $set: { description: 'x' } })).rejects.toThrow('imutáveis');
    },
  );

  test('editar e salvar um lançamento existente é bloqueado', async () => {
    const e = make([{ account: A, debit: 10 }, { account: B, credit: 10 }]);
    e.isNew = false;
    e.description = 'alterado';
    await expect(e.save()).rejects.toThrow('imutáveis');
  });
});
