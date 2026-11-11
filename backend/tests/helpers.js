const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');

/** Simula uma Query do Mongoose: encadeável (.select) e "await"-ável. */
const query = (value) => ({
  select() { return this; },
  populate() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  catch(reject) { return Promise.resolve(value).catch(reject); },
});

/** Cria um documento User real (sem banco) com save() simulado. */
const makeUser = async (overrides = {}) => {
  const { password = 'Senha123!', ...rest } = overrides;
  const user = new User({
    _id: new mongoose.Types.ObjectId(),
    name: 'Fatumata Baldé',
    email: 'fatumata@exemplo.gw',
    phone: '+245955111222',
    password: await bcrypt.hash(password, 4),
    status: 'active',
    accountNumber: 'GW123456789',
    ...rest,
  });
  user.save = jest.fn().mockResolvedValue(user);
  return user;
};

/** Faz User.findById / findOne devolverem o usuário certo pelos filtros usados. */
const mockUserStore = (users) => {
  const byId = (id) => users.find((u) => u._id.toString() === String(id)) || null;
  jest.spyOn(User, 'findById').mockImplementation((id) => query(byId(id)));
  jest.spyOn(User, 'findOne').mockImplementation((filter = {}) => {
    const found = users.find((u) => Object.entries(filter).every(([k, v]) => {
      if (v && typeof v === 'object' && '$gt' in v) return u[k] > v.$gt;
      return String(u[k]) === String(v);
    })) || null;
    return query(found);
  });
  jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
    const u = byId(filter._id);
    if (u && update.$unset) Object.keys(update.$unset).forEach((k) => { u[k] = undefined; });
    return query({ acknowledged: true });
  });
  jest.spyOn(AuditLog, 'create').mockResolvedValue({});
};

module.exports = { makeUser, mockUserStore, query };
