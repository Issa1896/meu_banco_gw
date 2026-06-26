import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactionAPI } from '../services/api';
import toast from 'react-hot-toast';

const paymentMethods = [
  { value: 'orange_money', label: 'Orange Money', icon: '🟠', desc: 'Envio via Orange Money' },
  { value: 'mobile_money', label: 'Mobile Money', icon: '📱', desc: 'Envio via Mobile Money' },
  { value: 'bank_transfer', label: 'Transferência Bancária', icon: '🏦', desc: 'Conta bancária local' },
  { value: 'pix', label: 'PIX', icon: '⚡', desc: 'PIX Internacional' },
  { value: 'iban', label: 'IBAN', icon: '🌍', desc: 'Transferência Internacional' },
  { value: 'wallet', label: 'Carteira Interna', icon: '👛', desc: 'Entre contas MeuBanco' },
];

const categories = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'lazer', label: 'Lazer' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outros', label: 'Outros' },
];

export default function NewTransfer() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    recipientAccount: '',
    amount: '',
    currency: 'XOF',
    description: '',
    paymentMethod: '',
    category: 'transferencia',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step === 1) { setStep(2); return; }
    if (step === 2 && !form.paymentMethod) { toast.error('Selecione um método de pagamento'); return; }
    if (step === 2) { setStep(3); return; }

    setLoading(true);
    try {
      await transactionAPI.transfer({
        ...form,
        amount: parseFloat(form.amount),
      });
      toast.success('Transferência realizada com sucesso!');
      navigate('/transactions');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao realizar transferência');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Nova Transferência</h1>
        <p className="text-gray-500">Envie dinheiro de forma segura e rápida</p>
      </div>

      {/* Steps */}
      <div className="flex items-center justify-center gap-4 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
              {s}
            </div>
            <span className={`text-sm ${step >= s ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>
              {s === 1 ? 'Destino' : s === 2 ? 'Método' : 'Confirmar'}
            </span>
            {s < 3 && <div className="w-12 h-0.5 bg-gray-200 dark:bg-gray-700" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Destino e Valor */}
        {step === 1 && (
          <div className="card space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold">Dados da Transferência</h2>

            <div>
              <label className="block text-sm font-medium mb-2">Conta do Destinatário</label>
              <input
                className="input-field"
                value={form.recipientAccount}
                onChange={(e) => setForm({ ...form, recipientAccount: e.target.value })}
                placeholder="Ex: GW123456789"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Valor</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  className="input-field flex-1"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0"
                  min="50"
                  required
                />
                <select className="input-field w-24" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="XOF">XOF</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="BRL">BRL</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Categoria</label>
              <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Descrição (opcional)</label>
              <input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Motivo da transferência" maxLength={200} />
            </div>

            <button type="submit" className="btn-primary w-full">Continuar</button>
          </div>
        )}

        {/* Step 2: Método de Pagamento */}
        {step === 2 && (
          <div className="card space-y-4 animate-fade-in">
            <h2 className="text-lg font-bold">Escolha o Método de Pagamento</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {paymentMethods.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  className={`p-4 rounded-xl border-2 text-left transition-all ${form.paymentMethod === method.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                  onClick={() => setForm({ ...form, paymentMethod: method.value })}
                >
                  <div className="text-2xl mb-2">{method.icon}</div>
                  <h3 className="font-medium text-sm">{method.label}</h3>
                  <p className="text-xs text-gray-500 mt-1">{method.desc}</p>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">Voltar</button>
              <button type="submit" className="btn-primary flex-1">Continuar</button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmação */}
        {step === 3 && (
          <div className="card space-y-4 animate-fade-in">
            <h2 className="text-lg font-bold">Confirmar Transferência</h2>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Destinatário</span>
                <span className="font-medium">{form.recipientAccount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Valor</span>
                <span className="font-bold text-lg">{parseFloat(form.amount).toLocaleString()} {form.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Método</span>
                <span className="font-medium capitalize">{form.paymentMethod.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Categoria</span>
                <span className="font-medium capitalize">{form.category}</span>
              </div>
              {form.description && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Descrição</span>
                  <span className="font-medium">{form.description}</span>
                </div>
              )}
              <div className="border-t border-gray-200 dark:border-gray-600 pt-3 flex justify-between">
                <span className="font-bold">Taxa (estimada)</span>
                <span className="font-bold text-red-600">{Math.round(parseFloat(form.amount || 0) * 0.01).toLocaleString()} XOF</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(2)} className="btn-secondary flex-1">Voltar</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? 'Processando...' : 'Confirmar e Enviar'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
