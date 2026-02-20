const { articalService } = require('../services');

const addnewArtical = async (req, res) => {
  try {
    const result = await articalService.addArticle(req.body); 
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
const getAllArticals = async (req, res) => {
  try {
    const articles = await articalService.getAllArticles();
    res.json({ success: true, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get article by ID
const getArticalById = async (req, res) => {
  try {
    const article = await articalService.getArticleById(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' });

    res.json({ success: true, data: article });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

//Update article by ID
const updateArtical = async (req, res) => {
  try {
    const updated = await articalService.updateArticle(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

//Soft delete article by ID
const deleteArtical = async (req, res) => {
  try {
    const deleted = await articalService.softDeleteArticle(req.params.id);
    res.json({ success: true, message: 'Article soft deleted', data: deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  addnewArtical,
  getAllArticals,
  getArticalById,
  updateArtical,
  deleteArtical
};
