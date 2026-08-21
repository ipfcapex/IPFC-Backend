const express = require('express');
const router = express.Router();
const { articalController}= require('../controllers');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');

router.post('/addnew', requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), articalController.addnewArtical);
router.get('/getall', requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), articalController.getAllArticals);
router.get('/:id/getartical', requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), articalController.getArticalById);
router.put('/:id/update', requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), articalController.updateArtical);
router.delete('/:id/delete', requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), articalController.deleteArtical);

module.exports = router;