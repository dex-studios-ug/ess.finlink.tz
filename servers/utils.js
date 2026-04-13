// utils.js
const express = require('express');
const router = express.Router();


// -------------------- VOUCHER --------------------
router.get('/voucher',async (req, res) => {
    let db= req.app.locals.db;
    try{
    const row=await db.get(`SELECT * FROM VCN WHERE id=1`);
        if (!row) return res.status(500).json({ error: 'not found' });

        const currentNum = row.num;

        await db.run(`UPDATE VCN SET num = ? WHERE id=1`, [currentNum + 1]);
        res.json({ vcn:'TPS-'+ (''+currentNum).padStart(9,'0') });
    }catch(err){
         if (err) return res.status(500).json({ error: err.message });
    }
  
});

// -------------------- SETTINGS --------------------
// GET /settings
router.get('/settings', async (req, res) => {
    let db= req.app.locals.db;
    await db.get(`SELECT * FROM settings WHERE id=1`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "No settings saved" });

        let settings;
        try {
            settings = JSON.parse(row.settings);
        } catch (e) {
            return res.status(500).json({ error: "Corrupt settings data" });
        }
        settings.sms_volume = row.sms_volume;
    
        res.json(settings);
    });
});

// POST /settings
router.post('/settings', async (req, res) => {
    let db= req.app.locals.db;
    const sts = req.body;
    if (!sts || typeof sts !== 'object') {
        return res.status(400).json({ error: "Invalid settings data" });
    }

    const settingsStr = JSON.stringify(sts);

   await  db.get(`SELECT * FROM settings WHERE id=1`,async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!row) {
           await  db.run(`INSERT INTO settings (id, settings) VALUES (1, ?)`, [settingsStr], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "success" });
            });
        } else {
          await  db.run(`UPDATE settings SET settings=? WHERE id=1`, [settingsStr], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "success" });
            });
        }
    });
});

module.exports = { utils_router: router  };