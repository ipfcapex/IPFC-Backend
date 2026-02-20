const express = require('express');
const router = express.Router();
const { articalController}= require('../controllers');

router.post('/addnew', articalController.addnewArtical);
router.get('/getall', articalController.getAllArticals);
router.get('/:id/getartical', articalController.getArticalById);
router.put('/:id/update', articalController.updateArtical);
router.delete('/:id/delete', articalController.deleteArtical);

module.exports = router;