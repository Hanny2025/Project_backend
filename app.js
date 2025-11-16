const express = require("express");
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken"); // 1. 

// 2. 
const JWT_SECRET =
  "your-super-secret-key-change-this-later-123456789";

const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

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
        r.Room_id, r.Room_name, r.image_url, r.status AS Room_status, 
        ts.Slot_id, ts.Label AS Slot_label,
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
    
    // ... (โค้ด Map ข้อมูลห้องเหมือนเดิม) ...
    if (rows.length === 0) {
      return res.json([]);
    }
    const roomsMap = new Map();
    for (const row of rows) {
      if (!roomsMap.has(row.Room_id)) {
        roomsMap.set(row.Room_id, {
          Room_id: row.Room_id,
          Room_name: row.Room_name,
          image_url: row.image_url,
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
    res.json(Array.from(roomsMap.values()));

  } catch (error) {
    console.error("Error fetching rooms with status:", error);
    res.status(500).json({ message: "Internal Server Error" });
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

/**
 * */
app.get("/api/dashboard/summary", verifyToken, isLecturerOrStaff, async (req, res) => {
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

/**
 * */
app.post("/staff/add_room", verifyToken, isLecturerOrStaff, async (req, res) => {
  const { Room_name, image_url, price_per_day, status } = req.body;
  try {
    if (!Room_name || !price_per_day) {
      return res.status(400).json({ message: "Room name and price are required" });
    }
    const [existingRoom] = await pool.query(
      "SELECT Room_name FROM room WHERE Room_name = ?",
      [Room_name]
    );
    if (existingRoom.length > 0) {
      return res.status(400).json({ message: "Room name already exists" });
    }
    const [result] = await pool.query(
      "INSERT INTO room (Room_name, image_url, price_per_day, status) VALUES (?, ?, ?, ?)",
      [Room_name, image_url, price_per_day, status || 'available']
    );
    res.status(201).json({ 
      message: "Room added successfully", 
      room_id: result.insertId 
    });
  } catch (error) {
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
  try {
    await connection.beginTransaction();

    const [booking] = await connection.query(
      `SELECT * FROM bookings WHERE Booking_id = ?`,
      [booking_id]
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

// ========================================================
// 
// ========================================================
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


// =========================
// ✅ Start Server
// =========================
app.listen(port, "0.0.0.0", () => {
  console.log(`Express server running at http://localhost:${port}`);
});