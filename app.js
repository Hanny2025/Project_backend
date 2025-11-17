const express = require("express");
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");
<<<<<<< HEAD
const multer = require('multer');
const path = require('path');
const fs = require('fs');
=======
const jwt = require("jsonwebtoken"); // 1. 

// 2. 
const JWT_SECRET =
  "your-super-secret-key-change-this-later-123456789";

>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, 'uploads', 'rooms');
    
    // ⭐️ สร้างโฟลเดอร์ถ้ายังไม่มี
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
      console.log('📁 Created upload directory:', uploadPath);
    }
    
    console.log('📂 Saving file to:', uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileName = 'room-' + uniqueSuffix + path.extname(file.originalname);
    console.log('📄 File will be saved as:', fileName);
    cb(null, fileName);
  }
});


const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    console.log('📁 File details:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    // ⭐️ อนุญาต application/octet-stream ด้วย (มักมาจาก mobile)
    const allowedMimes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml',
      'application/octet-stream' // ⭐️ เพิ่มนี้
    ];

    // ⭐️ ตรวจสอบจาก extension ด้วย
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || 
        allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      console.log('❌ Rejected file:', {
        mimetype: file.mimetype,
        extension: fileExtension,
        originalname: file.originalname
      });
      cb(new Error(`File type ${file.mimetype} (${fileExtension}) is not allowed. Only image files are allowed!`), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ===================================
// 
// ===================================

/**
 * (ยาม) ตรวจสอบว่ามี Token ที่ถูกต้องส่งมาใน Header หรือไม่
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // 

  if (token == null) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    req.user = decoded; // 
    next(); // 
  });
}

/**
 * (ยาม) ตรวจสอบว่าเป็น Role Lecturer หรือ Staff
 */
function isLecturerOrStaff(req, res, next) {
  if (req.user.role === "Lecturer" || req.user.role === "Staff") {
    next(); // 
  } else {
    res
      .status(403)
      .json({ message: "Forbidden: Requires Lecturer or Staff role" });
  }
}

/**
 * (ยาม) ตรวจสอบว่าเป็น Role Student
 */
function isStudent(req, res, next) {
  if (req.user.role === "Student") {
    next(); // 
  } else {
    res.status(403).json({ message: "Forbidden: Requires Student role" });
  }
}

// ========================================================
// 
// (API ที่ทุกคนเรียกได้ ไม่ต้องใช้ Token)
// 
// ========================================================

app.get("/", (req, res) => {
  res.send("Hello from Express!");
});

/**
 * */
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid username" });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      delete user.password;
      const token = jwt.sign(
        { userId: user.User_id, role: user.role },
        JWT_SECRET,
        { expiresIn: "1d" }
      );
      res.status(200).json({
        message: "Login successful!",
        user: user,
        token: token,
      });
    } else {
      res.status(401).json({ message: "Invalid password" });
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body; // 

    if (!username || !password || !role) { // 
      return res
        .status(400)
        .json({ message: "Missing username, password, or role" });
    }

    const [existing] = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await pool.query(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, hashedPassword, role]
    );

    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("❌ Error during registration:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.get("/rooms-with-status", async (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ message: "Missing 'date' query parameter" });
  }
  try {
    const sql = `
      SELECT 
<<<<<<< HEAD
        r.Room_id,
        r.Room_name,
        r.image_url,
        r.price_per_day,
        r.status AS Room_status, 
        ts.Slot_id,
        ts.Label AS Slot_label,
=======
        r.Room_id, r.Room_name, r.image_url, r.status AS Room_status, 
        ts.Slot_id, ts.Label AS Slot_label,
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
        CASE 
            WHEN b.Room_id IS NOT NULL THEN b.status 
            ELSE 'Free' 
        END AS Slot_status
      FROM room r
      CROSS JOIN time_slots ts
      LEFT JOIN bookings b 
        ON r.Room_id = b.Room_id 
        AND ts.Slot_id = b.Slot_id 
        AND b.booking_date = ?
        AND b.status IN ('pending', 'approved')
      ORDER BY r.Room_id, ts.Slot_id;
    `;
<<<<<<< HEAD

=======
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
    const [rows] = await pool.query(sql, [date]);
    
    // ... (โค้ด Map ข้อมูลห้องเหมือนเดิม) ...
    if (rows.length === 0) {
      return res.json([]);
    }
    const roomsMap = new Map();
    for (const row of rows) {
      if (!roomsMap.has(row.Room_id)) {
        // ⭐️ แก้ไข: สร้าง full URL สำหรับ image_url
        let imageUrl = row.image_url;
        console.log('🖼️ Original image_url:', imageUrl);

        if (imageUrl && !imageUrl.startsWith('http')) {
          // ใช้ IP address โดยตรง
          imageUrl = `http://26.122.43.191:3000${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
        }

        console.log('🔗 Converted image_url:', imageUrl);

        roomsMap.set(row.Room_id, {
          Room_id: row.Room_id,
          Room_name: row.Room_name,
          image_url: imageUrl, // ⭐️ ส่ง full URL
          price_per_day: row.price_per_day,
          Room_status: row.Room_status,
          slots: [],
        });
      }
      roomsMap.get(row.Room_id).slots.push({
        Slot_id: row.Slot_id,
        Slot_label: row.Slot_label,
        Slot_status: row.Slot_status,
      });
    }
<<<<<<< HEAD

    const result = Array.from(roomsMap.values());
    res.json(result);
=======
    res.json(Array.from(roomsMap.values()));
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745

  } catch (error) {
    console.error("Error fetching rooms with status:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
app.get("/check-images", (req, res) => {
  const uploadsPath = path.join(__dirname, 'uploads', 'rooms');
  
  try {
    // ตรวจสอบว่าโฟลเดอร์มีอยู่หรือไม่
    if (!fs.existsSync(uploadsPath)) {
      console.log('❌ uploads/rooms folder does not exist');
      return res.json({ 
        exists: false, 
        message: 'uploads/rooms folder does not exist',
        currentDir: __dirname
      });
    }

    // อ่านไฟล์ทั้งหมดในโฟลเดอร์
    const files = fs.readdirSync(uploadsPath);
    console.log('📁 Files in uploads/rooms:', files);
    
    // ตรวจสอบไฟล์ที่ต้องการ
    const targetFile = 'room-1763396665467-336364186.png';
    const fileExists = files.includes(targetFile);
    
    console.log(`🔍 Looking for: ${targetFile}`);
    console.log(`✅ File exists: ${fileExists}`);
    
    if (fileExists) {
      const filePath = path.join(uploadsPath, targetFile);
      const fileStats = fs.statSync(filePath);
      console.log(`📊 File size: ${fileStats.size} bytes`);
    }

    res.json({
      folderExists: true,
      targetFile: targetFile,
      fileExists: fileExists,
      allFiles: files,
      uploadsPath: uploadsPath
    });

  } catch (error) {
    console.error('Error checking images:', error);
    res.status(500).json({ error: error.message });
  }
});


// ========================================================
// 
// (ต้องใช้ Token และ Role "Student" เท่านั้น)
// 
// ========================================================

/**
 * */
app.post("/bookings", verifyToken, isStudent, async (req, res) => {
  const { room_id, slot_id, booking_date } = req.body;
  const { userId } = req.user; // 

  if (!room_id || !slot_id || !userId || !booking_date) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 
    const [existingActiveBooking] = await connection.query(
      `SELECT * FROM bookings 
       WHERE User_id = ? AND booking_date = ? AND status IN ('pending', 'approved')`,
      [userId, booking_date]
    );

    if (existingActiveBooking.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message:
          "You can only have 1 booking per day.",
        existing_booking: existingActiveBooking[0],
      });
    }
    
    // ... (โค้ด Transaction ตรวจสอบ Slot เหมือนเดิม) ...
    const [existingSlot] = await connection.query(
      `SELECT * FROM bookings 
       WHERE Room_id = ? AND Slot_id = ? AND booking_date = ? AND status IN ('pending', 'approved')
       FOR UPDATE`,
      [room_id, slot_id, booking_date]
    );

    if (existingSlot.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: `Slot is already Booked` });
    }

    // 
    const [insertResult] = await connection.query(
      `INSERT INTO bookings (Room_id, Slot_id, User_id, booking_date, status) 
       VALUES (?, ?, ?, ?, 'pending')`,
      [room_id, slot_id, userId, booking_date]
    );

    const bookingId = insertResult.insertId;
    await connection.commit();
    res
      .status(201)
      .json({ message: "Booking request successful", booking_id: bookingId });

  } catch (error) {
    await connection.rollback();
    console.error("Error during booking:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
});

/**
 * */
app.get("/check", verifyToken, isStudent, async (req, res) => {
  const { userId } = req.user; 

  try {
    const [rows] = await pool.query(
      `SELECT 
         b.Booking_id, b.booking_date, b.status,
         r.Room_name, r.price_per_day,
         ts.Label AS Slot_label, u.username
       FROM bookings b
       JOIN room r ON b.Room_id = r.Room_id
       JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       JOIN users u ON b.User_id = u.User_id
       WHERE b.User_id = ? AND b.status IN ('pending', 'approved')
       ORDER BY b.booking_date DESC, ts.Slot_id ASC`,
      [userId] 
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.get("/history", verifyToken, isStudent, async (req, res) => {
  const { userId } = req.user; 

  try {
    const [rows] = await pool.query(
      `SELECT 
         h.Log_id, h.booking_id, h.action, h.action_time,
         b.Room_id, b.Slot_id, b.booking_date,
         COALESCE(r.Room_name, 'Unknown Room') AS Room_name,
         COALESCE(ts.Label, 'N/A') AS Slot_label
       FROM history h
       LEFT JOIN bookings b ON h.booking_id = b.Booking_id
       LEFT JOIN room r ON b.Room_id = r.Room_id
       LEFT JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       WHERE COALESCE(h.user_id, h.User_id) = ?
       ORDER BY b.booking_date DESC, h.action_time DESC`,
      [userId]
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error("🚨 Database error in history endpoint:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


// ========================================================
// 
// (ต้องใช้ Token และ Role "Lecturer" หรือ "Staff" เท่านั้น)
// 
// ========================================================

/**
 * */
app.get("/bookings/pending", verifyToken, isLecturerOrStaff, async (req, res) => {
  try {
    const sql = `
      SELECT 
         b.Booking_id, 
         b.booking_date AS date,
         r.Room_name AS roomName,
         r.image_url AS image,
         r.price_per_day AS price,
         ts.Label AS time,
         u.username AS username
       FROM bookings b
       JOIN room r ON b.Room_id = r.Room_id
       JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       JOIN users u ON b.User_id = u.User_id
       WHERE b.status = 'pending'
       ORDER BY b.booking_date, ts.Slot_id`;
    
    const [rows] = await pool.query(sql);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching pending bookings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.patch("/bookings/:booking_id/status", verifyToken, isLecturerOrStaff, async (req, res) => {
  const { booking_id } = req.params;
  const { new_status } = req.body;
  const { userId } = req.user; // 

  if (!booking_id || !new_status || !["approved", "rejected"].includes(new_status)) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      "UPDATE bookings SET status = ? WHERE Booking_id = ? AND status = 'pending'",
      [new_status, booking_id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Booking not found or already processed" });
    }

    const [booking] = await connection.query(
      "SELECT User_id FROM bookings WHERE Booking_id = ?",
      [booking_id]
    );
    const studentUserId = booking[0]?.User_id || null;

    await connection.query(
      "INSERT INTO history (booking_id, user_id, actor_user_id, action, action_time) VALUES (?, ?, ?, ?, NOW())",
      [booking_id, studentUserId, userId, new_status]
    );

    await connection.commit();
    res.status(200).json({ message: `Booking ${new_status} successfully` });
  } catch (error) {
    await connection.rollback();
    console.error(`Error updating status for booking ${booking_id}:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
});
app.delete("/staff/delete_room", async (req, res) => {
  const { Room_id } = req.body;

<<<<<<< HEAD
  // 1. ตรวจสอบว่าส่ง Room_id มาหรือไม่
  if (!Room_id) {
    return res.status(400).json({
      success: false,
      message: "Room ID is required",
    });
  }

  try {
    // 2. ตรวจสอบว่าห้องนี้มีอยู่จริงหรือไม่
    const [existingRoom] = await pool.query(
      "SELECT Room_id FROM room WHERE Room_id = ?",
      [Room_id]
    );

    if (existingRoom.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // 3. ทำ Soft Delete: อัปเดต 'status' เป็น 'Disabled'
    // (เราไม่ใช้ DELETE จริงๆ เพราะข้อมูลนี้ผูกกับตาราง bookings และ history)
    const updateQuery = "UPDATE room SET status = 'Disabled' WHERE Room_id = ?";
    
    const [result] = await pool.query(updateQuery, [Room_id]);

    if (result.affectedRows === 0) {
      // เกิดข้อผิดพลาดบางอย่าง หรือ status เป็น 'Disabled' อยู่แล้ว
      return res.status(500).json({
        success: false,
        message: "Failed to disable room or status was already Disabled",
      });
    }

    // 4. ส่งข้อความสำเร็จกลับไป
    return res.status(200).json({
      success: true,
      message: "Room successfully disabled (soft deleted)",
    });

  } catch (error) {
    // 5. จัดการ Error
    console.error("Error during soft delete:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});
// =========================
// ✅ API ยกเลิกการจอง (Cancel Booking)
// =========================
app.delete("/bookings/:booking_id", async (req, res) => {
  const { booking_id } = req.params;

  if (!booking_id) {
    return res.status(400).json({ message: "Missing booking_id" });
  }

  const connection = await pool.getConnection();

=======
/**
 * */
app.get("/api/dashboard/summary", verifyToken, isLecturerOrStaff, async (req, res) => {
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
  try {
    const totalSlotsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM room) AS roomCount,
        (SELECT COUNT(*) FROM time_slots) AS slotCount
    `;
    const bookedSlotsTodayQuery = `
      SELECT COUNT(*) AS bookedCount 
      FROM bookings 
      WHERE booking_date = CURDATE() 
        AND status IN ('pending', 'approved')
    `;
    const pendingSlotsQuery = `
      SELECT COUNT(*) AS pendingCount 
      FROM bookings 
      WHERE status = 'pending'
    `;
    const disabledRoomsQuery = `
      SELECT COUNT(*) AS disabledCount 
      FROM room 
      WHERE status = 'disabled'
    `;
    
    const [
      totalSlotsData,
      bookedSlotsTodayData,
      pendingSlotsData,
      disabledRoomsData,
    ] = await Promise.all([
      pool.query(totalSlotsQuery),
      pool.query(bookedSlotsTodayQuery),
      pool.query(pendingSlotsQuery),
      pool.query(disabledRoomsQuery),
    ]);

    const totalSlotsResult = totalSlotsData[0][0];
    const bookedSlotsTodayResult = bookedSlotsTodayData[0][0];
    const pendingSlotsResult = pendingSlotsData[0][0];
    const disabledRoomsResult = disabledRoomsData[0][0];

    const totalSlots =
      (totalSlotsResult.roomCount || 0) * (totalSlotsResult.slotCount || 0);
    const freeSlots = totalSlots - (bookedSlotsTodayResult.bookedCount || 0);
    const pendingSlots = pendingSlotsResult.pendingCount || 0;
    const disabledRooms = disabledRoomsResult.disabledCount || 0;

    res.status(200).json({
      totalSlots: totalSlots,
      freeSlots: freeSlots,
      pendingSlots: pendingSlots,
      disabledRooms: disabledRooms,
    });
  } catch (error) {
    console.error("❌ Error fetching dashboard summary:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.get("/staff/history", verifyToken, isLecturerOrStaff, async (req, res) => {
  try {
    const [history] = await pool.query(`
      SELECT 
        h.Log_id, h.booking_id, h.user_id, h.action, h.action_time,
        u.username, u.role,
        b.Room_id, r.Room_name, b.booking_date,
        s.Start_time, s.End_time
      FROM history h
      LEFT JOIN users u ON h.user_id = u.User_id
      LEFT JOIN bookings b ON h.booking_id = b.Booking_id
      LEFT JOIN room r ON b.Room_id = r.Room_id
      LEFT JOIN time_slots s ON b.Slot_id = s.Slot_id
      ORDER BY h.action_time DESC
    `);
    res.status(200).json({
      message: "History retrieved successfully",
      data: history
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.get("/staff/dashboard", verifyToken, isLecturerOrStaff, async (req, res) => {
  try {
    const [totalBookings] = await pool.query(`
      SELECT COUNT(*) as total FROM bookings
    `);
    const [bookingStatus] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM bookings 
      GROUP BY status
    `);
    const [userRoles] = await pool.query(`
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role
    `);
    const [recentHistory] = await pool.query(`
      SELECT 
        h.action, h.action_time,
        u.username, u.role,
        r.Room_name
      FROM history h
      LEFT JOIN users u ON h.user_id = u.User_id
      LEFT JOIN bookings b ON h.booking_id = b.Booking_id
      LEFT JOIN room r ON b.Room_id = r.Room_id
      ORDER BY h.action_time DESC 
      LIMIT 10
    `);
    res.status(200).json({
      message: "Dashboard data retrieved successfully",
      data: {
        totalBookings: totalBookings[0].total,
        bookingStatus,
        userRoles,
        recentHistory
      }
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.get("/history/all", verifyToken, isLecturerOrStaff, async (req, res) => {
  const { userId } = req.user; 

  try {
    const [rows] = await pool.query(
      `SELECT 
         h.Log_id, h.booking_id, h.action, h.action_time,
         b.booking_date,
         COALESCE(r.Room_name, 'Unknown Room') AS Room_name,
         COALESCE(ts.Label, 'N/A') AS Slot_label,
         COALESCE(u.username, 'Unknown User') AS username 
       FROM history h
       LEFT JOIN bookings b ON h.booking_id = b.Booking_id
       LEFT JOIN room r ON b.Room_id = r.Room_id
       LEFT JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       LEFT JOIN users u ON COALESCE(h.user_id, h.User_id) = u.User_id 
       WHERE h.actor_user_id = ? 
       ORDER BY h.action_time DESC`,
      [userId]
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error("🚨 Database error in /history/all endpoint:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.get("/staff/rooms", verifyToken, isLecturerOrStaff, async (req, res) => {
  try {
    const [rooms] = await pool.query(`
      SELECT 
        Room_id, Room_name, image_url, price_per_day, status
      FROM room 
      ORDER BY Room_id DESC
    `);
    if (rooms.length === 0) {
      return res.status(404).json({ 
        message: "No rooms found",
        data: []
      });
    }
    res.status(200).json({
      message: "Rooms retrieved successfully",
      data: rooms
    });
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ 
      message: "Internal Server Error",
      error: error.message 
    });
  }
});
console.log('Current directory:', __dirname);

// ตั้งค่า static file serving ที่ถูกต้อง
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// หรือใช้แบบนี้
app.use(express.static('uploads')); // สำหรับโฟลเดอร์ uploads ใน root

// หรือแบบละเอียด
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ทดสอบ route
app.get('/test-static', (req, res) => {
  res.json({
    currentDir: __dirname,
    currentWorkingDir: process.cwd(),
    uploadsPath: path.join(__dirname, 'uploads')
  });
});

<<<<<<< HEAD
// Small debug endpoint to quickly inspect recent history rows (useful during dev)
app.get("/history/debug", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM history ORDER BY action_time DESC LIMIT 50`
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching history debug:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
app.post("/staff/upload-room-image", upload.single('image'), async (req, res) => {
=======
/**
 * */
app.post("/staff/add_room", verifyToken, isLecturerOrStaff, async (req, res) => {
  const { Room_name, image_url, price_per_day, status } = req.body;
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file uploaded"
      });
    }

    // ส่ง full URL ที่ถูกต้อง
    const imageUrl = `http://26.122.43.191:3000/uploads/rooms/${req.file.filename}`;

    res.json({
      success: true,
      message: "Image uploaded successfully",
      image_url: imageUrl,  // ใช้ full URL
      filename: req.file.filename
    });

  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading image"
    });
  }
});

// ⭐️ ต้องใช้ 'room_image' (เอกพจน์) เพราะใช้ upload.single()
app.post("/staff/add_room", upload.single('room_image'), async (req, res) => {
  console.log('📨 Received POST to /staff/add_room');
  console.log('📝 Body:', req.body);
  console.log('📁 File:', req.file);

  try {
    const { Room_name, price_per_day, status, description } = req.body;

    if (!Room_name || !price_per_day) {
      return res.status(400).json({ 
        message: "Room name and price are required"
      });
    }

    let image_url = null;
    if (req.file) {
      image_url = `/uploads/rooms/${req.file.filename}`;
      console.log('🖼️ Image URL:', image_url);
    }

    // ตรวจสอบ room name ซ้ำ
    const [existingRoom] = await pool.query(
      "SELECT Room_name FROM room WHERE Room_name = ?",
      [Room_name]
    );

    if (existingRoom.length > 0) {
      return res.status(400).json({ message: "Room name already exists" });
    }

    // ⭐️ แก้ไข: ใช้ SQL แบบไม่มี description ชั่วคราว
    const [result] = await pool.query(
      "INSERT INTO room (Room_name, image_url, price_per_day, status) VALUES (?, ?, ?, ?)",
      [Room_name, image_url, price_per_day, status || 'available']
    );

    console.log('✅ Room inserted successfully, ID:', result.insertId);

    res.status(201).json({ 
      message: "Room added successfully", 
      room_id: result.insertId,
      image_url: image_url
    });

  } catch (error) {
<<<<<<< HEAD
    console.error("❌ Error adding room:", error);
    
    // ⭐️ แก้ไข: ตรวจสอบว่า fs ถูก define ก่อนใช้
    if (req.file && typeof fs !== 'undefined') {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ Deleted uploaded file due to error');
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
      }
    } else if (req.file) {
      console.log('⚠️ File uploaded but fs module not available to delete');
    }
    
    res.status(500).json({ 
      message: "Internal Server Error",
      error: error.message 
    });
  }
});

app.get("/staff/history", async (req, res) => {
=======
    console.error("Error adding room:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * */
app.post("/staff/edit_room", verifyToken, isLecturerOrStaff, async (req, res) => {
  const { Room_id, Room_name, image_url, price_per_day, status } = req.body;
  
  try {
    if (!Room_id) {
      return res.status(400).json({ message: "Room ID is required" });
    }
    const [existingRoom] = await pool.query(
      "SELECT Room_id FROM room WHERE Room_id = ?",
      [Room_id]
    );
    if (existingRoom.length === 0) {
      return res.status(404).json({ message: "Room not found" });
    }
    if (Room_name) {
      const [duplicateRoom] = await pool.query(
        "SELECT Room_id FROM room WHERE Room_name = ? AND Room_id != ?",
        [Room_name, Room_id]
      );
      if (duplicateRoom.length > 0) {
        return res.status(400).json({ message: "Room name already exists" });
      }
    }
    let updateFields = [];
    let updateValues = [];
    if (Room_name) {
      updateFields.push("Room_name = ?");
      updateValues.push(Room_name);
    }
    if (image_url) {
      updateFields.push("image_url = ?");
      updateValues.push(image_url);
    }
    if (price_per_day) {
      updateFields.push("price_per_day = ?");
      updateValues.push(price_per_day);
    }
    if (status) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }
    if (updateFields.length > 0) {
      updateValues.push(Room_id); 
      await pool.query(
        `UPDATE room SET ${updateFields.join(", ")} WHERE Room_id = ?`,
        updateValues
      );
      res.status(200).json({ 
        message: "Room updated successfully" 
      });
    } else {
      res.status(400).json({ 
        message: "No fields to update" 
      });
    }
  } catch (error) {
    console.error("Error updating room:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// ========================================================
// 
// (ต้องใช้ Token แต่ใช้ได้ทุก Role)
// 
// ========================================================

/**
 * */
app.delete("/bookings/:booking_id", verifyToken, async (req, res) => {
  const { booking_id } = req.params;
  const { userId } = req.user; // 

  const connection = await pool.getConnection();
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
  try {
    await connection.beginTransaction();

<<<<<<< HEAD
    res.status(200).json({
      message: "History retrieved successfully",
      data: history
    });

  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/staff/dashboard", async (req, res) => {
  try {
 
    const [totalBookings] = await pool.query(`
      SELECT COUNT(*) as total FROM bookings
    `);

   
    const [bookingStatus] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM bookings 
      GROUP BY status
    `);

   
    const [userRoles] = await pool.query(`
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role
    `);

   
    const [recentHistory] = await pool.query(`
      SELECT 
        h.action,
        h.action_time,
        u.username,
        u.role,
        r.Room_name
      FROM history h
      LEFT JOIN users u ON h.user_id = u.User_id
      LEFT JOIN bookings b ON h.booking_id = b.Booking_id
      LEFT JOIN room r ON b.Room_id = r.Room_id
      ORDER BY h.action_time DESC 
      LIMIT 10
    `);

    res.status(200).json({
      message: "Dashboard data retrieved successfully",
      data: {
        totalBookings: totalBookings[0].total,
        bookingStatus,
        userRoles,
        recentHistory
      }
    });

  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// ✅ API ดึงประวัติ (History) - (สำหรับ Lecturer/Admin)
// =========================
app.get("/history/all", async (req, res) => {
  console.log("📊 Request received for /history/all (Lecturer View)");

  try {
    // ❗️ Key: เราลบ "WHERE user_id = ?" ออกไป
    // และเราเพิ่ม u.username เข้ามา เพื่อให้รู้ว่าเป็นของใคร
    const [rows] = await pool.query(
      `SELECT 
h.Log_id,
h.booking_id,
h.action,
h.action_time,
b.booking_date,
COALESCE(r.Room_name, 'Unknown Room') AS Room_name,
COALESCE(ts.Label, 'N/A') AS Slot_label,
COALESCE(u.username, 'Unknown User') AS username 
FROM history h
LEFT JOIN bookings b ON h.booking_id = b.Booking_id
LEFT JOIN room r ON b.Room_id = r.Room_id
LEFT JOIN time_slots ts ON b.Slot_id = ts.Slot_id
LEFT JOIN users u ON COALESCE(h.user_id, h.User_id) = u.User_id 
ORDER BY h.action_time DESC`
=======
    const [booking] = await connection.query(
      `SELECT * FROM bookings WHERE Booking_id = ?`,
      [booking_id]
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
    );

    if (booking.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Booking not found" });
    }

    // 
    if (req.user.role === 'Student' && booking[0].User_id !== userId) {
      await connection.rollback();
      return res.status(403).json({ message: "Forbidden: You can only cancel your own bookings" });
    }
    // 

    await connection.query(
      `UPDATE bookings SET status = 'cancelled' WHERE Booking_id = ?`,
      [booking_id]
    );

    try {
      const studentUserId = booking[0].User_id ?? null;
      await connection.query(
        `INSERT INTO history (booking_id, user_id, actor_user_id, action, action_time) VALUES (?, ?, ?, ?, NOW())`,
        [booking_id, studentUserId, userId, "cancelled"]
      );
    } catch (e) {
      console.error("Failed to insert history for cancellation:", e);
    }

    await connection.commit();
    res.status(200).json({ message: "Booking cancelled successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("Error cancelling booking:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
});

/**
 * */
app.get("/get_user", verifyToken, async (req, res) => {
  // 
  // 
  const userIdToFetch = req.query.user_id ?? req.user.userId;

  try {
    const userId = parseInt(userIdToFetch);
    const [rows] = await pool.query(
      "SELECT User_id, username, role FROM users WHERE User_id = ?",
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error(" Database error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

<<<<<<< HEAD

// GET /staff/rooms
app.get("/staff/rooms", async (req, res) => {
=======
// ========================================================
// 
// ========================================================
app.get("/history/debug", async (req, res) => {
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
  try {
    const [rows] = await pool.query(
      `SELECT * FROM history ORDER BY action_time DESC LIMIT 50`
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching history debug:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
app.post("/staff/edit_room", async (req, res) => {
  const { Room_id, Room_name, image_url, price_per_day, status, description } = req.body;

<<<<<<< HEAD
  try {
    if (!Room_id) {
      return res.status(400).json({
        success: false,
        message: "Room ID is required",
      });
    }

    // Check if room exists
    const [existingRoom] = await pool.query(
      "SELECT Room_id FROM room WHERE Room_id = ?",
      [Room_id]
    );

    if (existingRoom.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Validate Room_name
    if (Room_name && Room_name.trim() !== "") {
      if (Room_name.length > 255) {
        return res.status(400).json({
          success: false,
          message: "Room name must not exceed 255 characters",
        });
      }

      const [duplicateRoom] = await pool.query(
        "SELECT Room_id FROM room WHERE Room_name = ? AND Room_id != ?",
        [Room_name.trim(), Room_id]
      );

      if (duplicateRoom.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Room name already exists",
        });
      }
    }

    // Validate Status
    const validStatuses = ["Free", "Approved", "Rejected", "Disabled"];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    // Validate Price
    if (price_per_day !== undefined && price_per_day !== null) {
      if (isNaN(price_per_day) || price_per_day < 0) {
        return res.status(400).json({
          success: false,
          message: "Price must be a positive number",
        });
      }
    }

    // Validate Image URL
    if (image_url && image_url.trim() !== "") {
      if (
        !image_url.match(/^https?:\/\/.+\..+/) &&
        !image_url.startsWith("/") &&
        !image_url.startsWith("data:image/")
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid image URL format",
        });
      }
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];

    if (Room_name && Room_name.trim() !== "") {
      updateFields.push("Room_name = ?");
      updateValues.push(Room_name.trim());
    }

    if (image_url !== undefined) {
      if (!image_url || image_url.trim() === "") {
        updateFields.push("image_url = NULL");
      } else {
        updateFields.push("image_url = ?");
        updateValues.push(image_url.trim());
      }
    }

    if (price_per_day !== undefined && price_per_day !== null) {
      updateFields.push("price_per_day = ?");
      updateValues.push(parseFloat(price_per_day));
    }

    if (status !== undefined) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }

    if (description !== undefined) {
      if (!description || description === "") {
        updateFields.push("description = NULL");
      } else {
        updateFields.push("description = ?");
        updateValues.push(description);
      }
    }

  

    // Perform update
    updateValues.push(Room_id);

    const updateQuery = `
      UPDATE room
      SET ${updateFields.join(", ")}
      WHERE Room_id = ?
    `;

    const [result] = await pool.query(updateQuery, updateValues);

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: "Failed to update room",
      });
    }

    // Return updated data
    const [updatedRoom] = await pool.query(
      "SELECT * FROM room WHERE Room_id = ?",
      [Room_id]
    );

    return res.status(200).json({
      success: true,
      message: "Room updated successfully",
      room: updatedRoom[0],
    });
  } catch (error) {
    console.error("Error updating room:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

// เริ่มต้นเซิร์ฟเวอร์
=======

// =========================
// ✅ Start Server
// =========================
>>>>>>> 90e4dbb5c9d74539b581a233ce34894894d0a745
app.listen(port, "0.0.0.0", () => {
  console.log(`Express server running at http://localhost:${port}`);
});