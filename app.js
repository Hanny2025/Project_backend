const express = require("express");
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

app.get("/", (req, res) => {
  res.send("Hello from Express!");
});

// =========================
// ✅ Login API (ปลอดภัย)
// =========================
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log("Login attempt received:", { username });

    // 2. ค้นหา "username" อย่างเดียว
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    // 3. ถ้าไม่เจอ username
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid username" });
    }

    const user = rows[0];

    // 4. เปรียบเทียบรหัสผ่านที่ส่งมา กับ "hash" ใน DB
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      // ✅ รหัสผ่านถูกต้อง
      delete user.password; // ลบ hash ออกจากข้อมูลที่จะส่งกลับ
      res.status(200).json({
        message: "Login successful!",
        user: user,
      });
    } else {
      // ❌ รหัสผ่านผิด
      res.status(401).json({ message: "Invalid  password" });
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// ✅ Register API (ปลอดภัย)
// =========================
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Missing username or password" });
    }

    // ตรวจว่ามีผู้ใช้นี้อยู่แล้วไหม
    const [existing] = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    // 5. สร้าง Hash จากรหัสผ่าน
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 6. บันทึก "hashedPassword" ลง DB
    await pool.query("INSERT INTO users (username, password) VALUES (?, ?)", [
      username,
      hashedPassword,
    ]);

    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("❌ Error during registration:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ===================================
// ✅ แก้ไข: API ดึงสถานะห้องและสล็อต
// ===================================
app.get("/rooms-with-status", async (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ message: "Missing 'date' query parameter" });
  }

  try {
    const sql = `
      SELECT 
        r.Room_id,
        r.Room_name,
        r.image_url,
        r.price_per_day,
        r.status AS Room_status, 
        ts.Slot_id,
        ts.Label AS Slot_label,
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

    const [rows] = await pool.query(sql, [date]);

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

    const result = Array.from(roomsMap.values());
    res.json(result);

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

// ===================================
// ✅ แก้ไข: API สร้างการจอง
// ===================================
app.post("/bookings", async (req, res) => {
  const { room_id, slot_id, user_id, booking_date } = req.body;

  if (!room_id || !slot_id || !user_id || !booking_date) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ✅ ตรวจสอบว่าผู้ใช้มีการจองในวันที่เดียวกันแล้วหรือไม่ (จำกัด 1 ช่วง / วัน)
    const [existingActiveBooking] = await connection.query(
      `SELECT * FROM bookings 
       WHERE User_id = ? AND booking_date = ? AND status IN ('pending', 'approved')`,
      [user_id, booking_date]
    );

    console.log(
      `🔍 [CHECK USER LOCK] user_id=${user_id}, date=${booking_date} => Found ${existingActiveBooking.length} active booking(s)`
    );

    if (existingActiveBooking.length > 0) {
      console.log(
        `❌ [LOCK] User ${user_id} already has booking on ${booking_date}: `,
        existingActiveBooking[0]
      );
      await connection.rollback();
      return res.status(409).json({
        message:
          "You can only have 1 booking per day. Please cancel your existing booking for this date first.",
        existing_booking: existingActiveBooking[0],
      });
    }

    // ✅ แก้ไข: ตรวจสอบสถานะห้องจากตาราง 'bookings' (แทน room_slot_status)
    // ตรวจสอบว่ามี "ใครก็ได้" จอง Room_id, Slot_id, และ booking_date นี้ไปแล้วหรือยัง
    const [existingSlot] = await connection.query(
      `SELECT * FROM bookings 
       WHERE Room_id = ? AND Slot_id = ? AND booking_date = ? AND status IN ('pending', 'approved')
       FOR UPDATE`, // ใช้ FOR UPDATE เพื่อ lock แถว ป้องกันการจองซ้ำซ้อน
      [room_id, slot_id, booking_date]
    );

    console.log(
      `🔍 [CHECK SLOT] room=${room_id}, slot=${slot_id}, date=${booking_date} => Found ${existingSlot.length} active booking(s)`
    );

    // ✅ แก้ไข: ตรวจสอบว่ามีแถวข้อมูลหรือไม่ (ถ้ามี > 0 แสดงว่า slot ไม่ว่าง)
    if (existingSlot.length > 0) {
      console.log(
        `❌ [SLOT TAKEN] Room ${room_id} Slot ${slot_id} on ${booking_date} is already booked by user ${existingSlot[0].User_id}`
      );
      await connection.rollback();
      return res.status(409).json({ message: `Slot is already Booked` });
    }

    console.log(
      `✅ [SLOT FREE] Room ${room_id} Slot ${slot_id} on ${booking_date} is available for user ${user_id}`
    );

    // สร้างการจอง (อันนี้ถูกต้องแล้ว)
    const [insertResult] = await connection.query(
      `INSERT INTO bookings (Room_id, Slot_id, User_id, booking_date, status) 
       VALUES (?, ?, ?, ?, 'pending')`, // สร้างเป็น 'pending' ก่อน
      [room_id, slot_id, user_id, booking_date]
    );

    console.log(
      `📝 [BOOKING CREATED] user=${user_id}, booking_id=${insertResult.insertId}, status='pending'`
    );

    const bookingId = insertResult.insertId || insertResult.insert_id || null;

    await connection.commit();
    console.log(`✅ [TRANSACTION COMMITTED] booking_id=${bookingId}`);
    res
      .status(201)
      .json({ message: "Booking request successful", booking_id: bookingId });
  } catch (error) {
    await connection.rollback();
    console.error("Error during booking:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Duplicate booking detected",
      });
    }
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
});

// ✅ (ตัวอย่าง) API ดึงการจองที่ 'pending' ทั้งหมด
app.get("/bookings/pending", async (req, res) => {
  try {
    // 🔽🔽🔽 ใช้ SQL Query ใหม่นี้ 🔽🔽🔽
    const sql = `
      SELECT 
         b.Booking_id, 
         b.booking_date AS date,       -- 1. เปลี่ยนชื่อ AS date
         r.Room_name AS roomName,      -- 2. เปลี่ยนชื่อ AS roomName
         r.image_url AS image,       -- 3. เพิ่ม image (ต้องมีในตาราง room)
         r.price_per_day AS price,           -- 4. เพิ่ม price (ต้องมีในตาราง room)
         ts.Label AS time,           -- 5. เปลี่ยนชื่อ AS time
         u.username AS username        -- 6. เปลี่ยนชื่อ AS username
       FROM bookings b
       JOIN room r ON b.Room_id = r.Room_id
       JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       JOIN users u ON b.User_id = u.User_id
       WHERE b.status = 'pending'
       ORDER BY b.booking_date, ts.Slot_id`;
    // 🔼🔼🔼 ------------------- 🔼🔼🔼

    const [rows] = await pool.query(sql);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching pending bookings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ (ตัวอย่าง) API สำหรับ อนุมัติ (approve) หรือ ปฏิเสธ (reject)
app.patch("/bookings/:booking_id/status", async (req, res) => {
  const { booking_id } = req.params;
  const { new_status } = req.body; // รับ 'approved' หรือ 'rejected'

  if (
    !booking_id ||
    !new_status ||
    !["approved", "rejected"].includes(new_status)
  ) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // อัปเดตสถานะ
    const [result] = await connection.query(
      "UPDATE bookings SET status = ? WHERE Booking_id = ? AND status = 'pending'",
      [new_status, booking_id]
    );

    if (result.affectedRows === 0) {
      // อาจจะถูกอนุมัติ/ปฏิเสธไปแล้ว
      await connection.rollback();
      return res
        .status(404)
        .json({ message: "Booking not found or already processed" });
    }

    // บันทึกประวัติ (สำคัญมาก!)
    // (ดึง user_id จากการจองก่อน)
    const [booking] = await connection.query(
      "SELECT User_id FROM bookings WHERE Booking_id = ?",
      [booking_id]
    );
    const userId = booking[0]?.User_id || null;

    await connection.query(
      "INSERT INTO history (booking_id, user_id, action, action_time) VALUES (?, ?, ?, NOW())",
      [booking_id, userId, new_status] // บันทึก 'approved' หรือ 'rejected'
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

  try {
    await connection.beginTransaction();

    // ตรวจสอบว่าการจองมีอยู่จริงหรือไม่
    const [booking] = await connection.query(
      `SELECT * FROM bookings WHERE Booking_id = ?`,
      [booking_id]
    );

    if (booking.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Booking not found" });
    }

    // ยกเลิกการจอง (เปลี่ยน status เป็น cancelled)
    await connection.query(
      `UPDATE bookings SET status = 'cancelled' WHERE Booking_id = ?`,
      [booking_id]
    );

    // บันทึกประวัติการยกเลิก
    try {
      const historyUserId = booking[0].User_id ?? booking[0].user_id ?? null;
      await connection.query(
        `INSERT INTO history (booking_id, user_id, action, action_time) VALUES (?, ?, ?, NOW())`,
        [booking_id, historyUserId, "cancelled"]
      );
    } catch (e) {
      // หากการบันทึกประวัติล้มเหลว ให้วนต่อไป (ไม่ขัดขวางการยกเลิก)
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

// =========================
// ✅ API ตรวจสอบการจอง (Check)
// =========================
app.get("/check", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "Missing user_id" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT 
         b.Booking_id,
         b.booking_date,
         b.status,
         r.Room_name,
         r.price_per_day,
         ts.Label AS Slot_label,
         u.username
       FROM bookings b
       JOIN room r ON b.Room_id = r.Room_id
       JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       JOIN users u ON b.User_id = u.User_id
  WHERE b.User_id = ? AND b.status IN ('pending', 'approved')
       ORDER BY b.booking_date DESC, ts.Slot_id ASC`,
      [user_id]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ===================================
// ✅ API สำหรับหน้า Dashboard
// ===================================
app.get("/api/dashboard/summary", async (req, res) => {
  console.log("📊 Request received for /api/dashboard/summary");

  try {
    // 1. สร้าง Query 4 ตัว

    // 1.1. นับ "Total Slots" (จำนวนห้องทั้งหมด * จำนวนสล็อตทั้งหมด)
    const totalSlotsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM room) AS roomCount,
        (SELECT COUNT(*) FROM time_slots) AS slotCount
    `;

    // 1.2. นับ "Free Slots" (ของวันนี้)
    // (เราจะนับสล็อตที่ "ถูกจอง" แล้วเอาไปลบทีหลัง)
    const bookedSlotsTodayQuery = `
      SELECT COUNT(*) AS bookedCount 
      FROM bookings 
      WHERE booking_date = CURDATE() 
        AND status IN ('pending', 'approved')
    `;

    // 1.3. นับ "Pending Slots" (ทั้งหมด)
    const pendingSlotsQuery = `
      SELECT COUNT(*) AS pendingCount 
      FROM bookings 
      WHERE status = 'pending'
    `;

    // 1.4. นับ "Disable Rooms"
    const disabledRoomsQuery = `
      SELECT COUNT(*) AS disabledCount 
      FROM room 
      WHERE status = 'disabled'
    `;

    // 2. 🌟 (แก้ไข) รันทุก Query และรับผลลัพธ์แบบง่ายๆ
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

    // 3. 🌟 (แก้ไข) ดึง "แถวแรก" (row [0]) จาก "ข้อมูล" (data [0]) ของแต่ละผลลัพธ์
    // (เพราะ pool.query จะ trả về [rows, fields])
    const totalSlotsResult = totalSlotsData[0][0];
    const bookedSlotsTodayResult = bookedSlotsTodayData[0][0];
    const pendingSlotsResult = pendingSlotsData[0][0];
    const disabledRoomsResult = disabledRoomsData[0][0];

    // 4. (เพิ่ม) Log ไว้เช็กค่าที่ได้จาก DB (สำคัญมาก)
    console.log("🔍 Debug Query Results:", {
      totalSlotsResult,
      bookedSlotsTodayResult,
      pendingSlotsResult,
      disabledRoomsResult,
    });

    // 5. 🌟 (แก้ไข) คำนวณผลลัพธ์ (เพิ่ม || 0 เพื่อกันค่า null)
    const totalSlots =
      (totalSlotsResult.roomCount || 0) * (totalSlotsResult.slotCount || 0);
    const freeSlots = totalSlots - (bookedSlotsTodayResult.bookedCount || 0);
    const pendingSlots = pendingSlotsResult.pendingCount || 0;
    const disabledRooms = disabledRoomsResult.disabledCount || 0;

    // (เพิ่ม) Log ไว้เช็กค่าที่คำนวณได้
    console.log("🔢 Calculated Summary:", {
      totalSlots,
      freeSlots,
      pendingSlots,
      disabledRooms,
    });

    // 6. ส่ง JSON กลับไปให้ Flutter
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

// =========================
// ✅ API ดึงประวัติ (History)
// =========================
app.get("/history", async (req, res) => {
  // Accept user_id from query or body to be tolerant for different frontends
  const user_id_raw = req.query.user_id ?? req.body?.user_id;
  console.log(
    "📥 Received history request (query/body) for user_id:",
    user_id_raw
  );

  const userId = user_id_raw ? parseInt(user_id_raw, 10) : null;

  // If frontend didn't send user_id, return empty array (so UI can show empty history)
  if (!userId) {
    console.log("⚠️  No user_id provided to /history - returning empty array");
    return res.status(200).json([]);
  }

  try {
    // Use COALESCE to handle different possible column names in the history table (user_id or User_id)
    const [rows] = await pool.query(
      `SELECT 
         h.Log_id,
         h.booking_id,
         COALESCE(h.user_id, h.User_id) AS history_user_id,
         h.action,
         h.action_time,
         b.Room_id,
         b.Slot_id,
         b.booking_date,
         COALESCE(r.Room_name, 'Unknown Room') AS Room_name,
         COALESCE(ts.Label, 'N/A') AS Slot_label
       FROM history h
       LEFT JOIN bookings b ON h.booking_id = b.Booking_id
       LEFT JOIN room r ON b.Room_id = r.Room_id
       LEFT JOIN time_slots ts ON b.Slot_id = ts.Slot_id
      WHERE COALESCE(h.user_id, h.User_id) = ?
      -- Order by booking_date (newest first). If booking_date is NULL, fall back to action_time.
      ORDER BY b.booking_date DESC, h.action_time DESC`,
      [userId]
    );

    console.log(
      "📊 History data found for userId:",
      userId,
      "=>",
      rows.length,
      "items"
    );

    rows.forEach((row, index) => {
      console.log(`📦 History item ${index + 1}:`, {
        action: row.action,
        room_name: row.Room_name,
        booking_date: row.booking_date,
        slot_label: row.Slot_label,
      });
    });

    return res.status(200).json(rows);
  } catch (error) {
    console.error("🚨 Database error in history endpoint:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
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
  try {
    // ดึงประวัติทั้งหมดจากตาราง history
    const [history] = await pool.query(`
      SELECT 
        h.Log_id,
        h.booking_id,
        h.user_id,
        h.action,
        h.action_time,
        u.username,
        u.role,
        b.Room_id,
        r.Room_name,
        b.booking_date,
        s.Start_time,
        s.End_time
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
    );

    console.log("📊 Found", rows.length, "total history items for admin");
    return res.status(200).json(rows);
  } catch (error) {
    console.error("🚨 Database error in /history/all endpoint:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

// =========================
// ✅ API ดึงข้อมูลผู้ใช้
// =========================
app.get("/get_user", async (req, res) => {
  const { user_id } = req.query;

  console.log(" Received request for user_id:", user_id);

  if (!user_id) {
    console.log("❌ Missing user_id");
    return res.status(400).json({ message: "Missing user_id" });
  }

  try {
    const userId = parseInt(user_id);

    console.log(" Searching for user with ID:", userId);

    const [rows] = await pool.query(
      "SELECT User_id, username, role FROM users WHERE User_id = ?",
      [userId]
    );

    console.log("Database result:", rows);

    if (rows.length === 0) {
      console.log(" User not found in database");
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    console.log(" User found:", user);
    res.status(200).json(user);
  } catch (error) {
    console.error(" Database error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// GET /staff/rooms
app.get("/staff/rooms", async (req, res) => {
  try {
    const [rooms] = await pool.query(`
      SELECT 
        Room_id,
        Room_name,
        image_url,
        price_per_day,
        status
      FROM room 
      ORDER BY Room_id DESC
    `);

    // ตรวจสอบว่ามีข้อมูลหรือไม่
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
app.post("/staff/edit_room", async (req, res) => {
  const { Room_id, Room_name, image_url, price_per_day, status, description } = req.body;

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
app.listen(port, "0.0.0.0", () => {
  console.log(`Express server running at http://localhost:${port}`);
});