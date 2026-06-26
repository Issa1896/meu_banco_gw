const Ticket = require('../models/Ticket');
const AuditLog = require('../models/AuditLog');

exports.createTicket = async (req, res) => {
  try {
    const { subject, category, priority, message } = req.body;

    const ticket = await Ticket.create({
      user: req.user._id,
      subject,
      category,
      priority,
      messages: [{
        sender: req.user._id,
        message,
        isAI: false,
      }],
    });

    // Resposta automática do AI
    const aiResponse = await generateAIResponse(message, category);
    if (aiResponse) {
      ticket.messages.push({
        sender: req.user._id,
        message: aiResponse,
        isAI: true,
      });
      await ticket.save();
    }

    res.status(201).json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar ticket' });
  }
};

exports.getTickets = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { user: req.user._id };
    if (status) query.status = status;

    const tickets = await Ticket.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      tickets,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: await Ticket.countDocuments(query) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar tickets' });
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar ticket' });
  }
};

exports.replyTicket = async (req, res) => {
  try {
    const { message } = req.body;
    const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id });

    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      return res.status(400).json({ error: 'Ticket já foi resolvido' });
    }

    ticket.messages.push({
      sender: req.user._id,
      message,
      isAI: false,
    });
    ticket.status = 'in_progress';
    await ticket.save();

    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao responder ticket' });
  }
};

exports.closeTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    ticket.status = 'closed';
    ticket.closedAt = new Date();
    await ticket.save();

    res.json({ message: 'Ticket fechado', ticket });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fechar ticket' });
  }
};

async function generateAIResponse(message, category) {
  try {
    // Em produção: integrar com OpenAI ou Google Cloud AI
    const responses = {
      technical: 'Entendemos seu problema técnico. Nossa equipe analisará e retornará em breve.',
      payment: 'Sobre sua questão de pagamento, verifiquei que podemos ajudar. Você pode acompanhar o status no menu Transações.',
      security: 'Sua segurança é importante. Vamos verificar e entraremos em contato em até 24h.',
      account: 'Sobre sua conta, vamos analisar e retornar com as informações solicitadas.',
      general: 'Obrigado pelo contato! Nossa equipe responderá em breve.',
    };
    return responses[category] || 'Obrigado pelo contato. Sua solicitação foi registrada e será atendida em breve.';
  } catch (error) {
    return null;
  }
}

module.exports.generateAIResponse = generateAIResponse;
