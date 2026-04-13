const express = require('express');
const router = express.Router();


// Route to fetch all notifications with optional filters
router.get('/notifications',async  (req, res) => {
    const db = req.app.locals.db;
    const { content,userId, userRole,toUserId,toUserRole, offset = 0, limit = 15 } = req.query||{};
    //return res.json({success:true})

    let query = 'SELECT * FROM notifications WHERE 1=1'; // Base query to fetch all notifications
    const params = [];

    /*/ Apply filters based on userId and userRole
    if (userId) {
        query += ' AND userId = ?';
        params.push(userId);
    }
    if (userRole) {
        query += ' AND userRole = ?';
        params.push(userRole);
    }
    
    if (toUserId) {
        query += ' AND toUserId = ?';
        params.push(toUserId);
    }
    if (toUserRole) {
        query += ' AND toUserRole = ?';
        params.push(toUserRole);
    }
    if (content) {
        query += ' AND content LIKE ?';
        params.push(`%${content}%`);
    }
        */

    // Apply pagination
    query += ' LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
try{
    const rows = await db.all(query, params);
     res.json({ notifications: (rows||[]).filter(n => n.toUserId === userId || n.toUserRole === userRole || n.toUserId === null || n.toUserRole === null) });
}catch(err){
     if (err) {
            return res.status(500).json({ error: err.message });
        }
}
  
});

// Route to fetch a specific notification by ID
router.get('/notifications/:id',async  (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try{
    const row = await db.get('SELECT * FROM notifications WHERE id = ?', [id]);
    if (!row) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json(row);
    }catch
    (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
    }
});

// Route to create a new notification (with userId and userRole for testing purposes)
router.post('/notifications',async  (req, res) => {
    const db = req.app.locals.db;
    try{
    const { content, objectType=null, objectId=null, userId=null, userRole=null,toUserId=null, toUserRole=null } = req.body;
    console.log(content, objectType, objectId, userId, userRole)
    await db.run('INSERT INTO notifications (content, objectType, objectId, userId, userRole, toUserId, toUserRole, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [content, objectType, objectId, userId, userRole, toUserId, toUserRole, new Date().toISOString()]);
        res.json(req.body);
     }catch (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
       
    }
});

// Route to mark notifications as read
router.post('/notifications/mark-read',async  (req, res) => {
    const db = req.app.locals.db;
    const { notificationIds } = req.body;

    // Here, we'll assume we're just removing these notifications from unread, in a real application, we'd update the database
   if(!notificationIds.length)return res.status(417).json({
    error:"Notification Ids not supplied"
   })
        await db.run('UPDATE notifications SET read = 1 WHERE id in ('+notificationIds.map(id=>'?').join(',')+')' , notificationIds, (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
        });
   

    res.json({ message: 'Notifications marked as read' });
});

// Route to delete a notification by ID
router.delete('/notifications/:id',async  (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
try{
    await db.run('DELETE FROM notifications WHERE id = ?', [id]);
    res.json({ message: 'Notification deleted successfully' });
 }catch (err)  {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
    };
});



module.exports = {notifications_router:  router};