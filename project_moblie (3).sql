-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 06, 2025 at 07:21 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `project_moblie`
--

-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--

CREATE TABLE `bookings` (
  `Booking_id` int(11) NOT NULL,
  `Room_id` int(11) NOT NULL,
  `Slot_id` int(11) NOT NULL,
  `User_id` int(11) NOT NULL,
  `booking_date` date NOT NULL,
  `status` enum('approved','pending','rejected') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `bookings`
--

INSERT INTO `bookings` (`Booking_id`, `Room_id`, `Slot_id`, `User_id`, `booking_date`, `status`) VALUES
(31, 1, 1, 5, '2025-11-06', 'approved');

-- --------------------------------------------------------

--
-- Table structure for table `history`
--

CREATE TABLE `history` (
  `Log_id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `action` varchar(50) NOT NULL,
  `action_time` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `room`
--

CREATE TABLE `room` (
  `Room_id` int(11) NOT NULL,
  `Room_name` varchar(255) NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `status` enum('Free','Approve','Reject') NOT NULL,
  `Action` varchar(50) DEFAULT NULL,
  `price_per_day` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `room`
--

INSERT INTO `room` (`Room_id`, `Room_name`, `image_url`, `status`, `Action`, `price_per_day`) VALUES
(1, 'Meeting Room A1 ', NULL, 'Free', NULL, NULL),
(2, 'Conference Room B1 ', NULL, 'Free', NULL, NULL),
(3, 'Small Discussion Room C1 ', NULL, 'Free', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `room_slot_status`
--

CREATE TABLE `room_slot_status` (
  `Room_id` int(11) NOT NULL,
  `Slot_id` int(11) NOT NULL,
  `Date` date NOT NULL,
  `Status` enum('Free','Pending','Reserved','Disabled') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `room_slot_status`
--

INSERT INTO `room_slot_status` (`Room_id`, `Slot_id`, `Date`, `Status`) VALUES
(1, 1, '2025-11-06', 'Pending');

-- --------------------------------------------------------

--
-- Table structure for table `time_slots`
--

CREATE TABLE `time_slots` (
  `Slot_id` int(11) NOT NULL,
  `Start_time` time NOT NULL,
  `End_time` time NOT NULL,
  `Label` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `time_slots`
--

INSERT INTO `time_slots` (`Slot_id`, `Start_time`, `End_time`, `Label`) VALUES
(1, '08:00:00', '10:00:00', '08:00 - 10:00'),
(2, '10:00:00', '12:00:00', '10:00 - 12:00'),
(3, '13:00:00', '15:00:00', '13:00 - 15:00'),
(4, '15:00:00', '17:00:00', '15:00 - 17:00');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `User_id` int(11) NOT NULL,
  `username` varchar(64) NOT NULL,
  `password` char(60) NOT NULL,
  `role` enum('Student','Staff','Lecturer') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`User_id`, `username`, `password`, `role`) VALUES
(1, 'Ize', '$2b$10$bA7XBdi92oAC8IYBYKVkquoqnn7nrPRHa.sMPktkvDyDqN5/GRdf2', ''),
(2, 'Ize1', '$2b$10$oiiazUrsdTzb.1plkmw6ceZrGrDZdMimQ4oVsgYhxXreSePa44em.', ''),
(3, '1234', '$2b$10$CBGIQLk1GR41IVSnGVh/WewhT5/1wLRLYHXRFwaCUi5mLS.9BcP3.', ''),
(4, '3333', '$2b$10$aYmapnTnghlRXbM5Mq/WfOWIPgL3dILKT3XIrx3nPQhdhMYOLVDrC', 'Student'),
(5, '4567', '$2b$10$2vNOe6PjwbWx7/tTxN3P3.7JaNNgIkgZKeGJgQKQoTBfgScjK.Geq', 'Student');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`Booking_id`),
  ADD UNIQUE KEY `unique_user_slot_per_day` (`User_id`,`Slot_id`,`booking_date`),
  ADD KEY `Room_id` (`Room_id`),
  ADD KEY `Slot_id` (`Slot_id`),
  ADD KEY `idx_booking_check` (`User_id`,`Room_id`,`Slot_id`,`booking_date`);

--
-- Indexes for table `history`
--
ALTER TABLE `history`
  ADD PRIMARY KEY (`Log_id`),
  ADD KEY `booking_id` (`booking_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `room`
--
ALTER TABLE `room`
  ADD PRIMARY KEY (`Room_id`);

--
-- Indexes for table `room_slot_status`
--
ALTER TABLE `room_slot_status`
  ADD PRIMARY KEY (`Room_id`,`Slot_id`,`Date`),
  ADD KEY `Slot_id` (`Slot_id`);

--
-- Indexes for table `time_slots`
--
ALTER TABLE `time_slots`
  ADD PRIMARY KEY (`Slot_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`User_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `bookings`
--
ALTER TABLE `bookings`
  MODIFY `Booking_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;

--
-- AUTO_INCREMENT for table `history`
--
ALTER TABLE `history`
  MODIFY `Log_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `room`
--
ALTER TABLE `room`
  MODIFY `Room_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1235;

--
-- AUTO_INCREMENT for table `time_slots`
--
ALTER TABLE `time_slots`
  MODIFY `Slot_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `User_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `bookings`
--
ALTER TABLE `bookings`
  ADD CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`Room_id`) REFERENCES `room` (`Room_id`),
  ADD CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`Slot_id`) REFERENCES `time_slots` (`Slot_id`),
  ADD CONSTRAINT `bookings_ibfk_3` FOREIGN KEY (`User_id`) REFERENCES `users` (`User_id`);

--
-- Constraints for table `history`
--
ALTER TABLE `history`
  ADD CONSTRAINT `history_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`Booking_id`),
  ADD CONSTRAINT `history_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`User_id`);

--
-- Constraints for table `room_slot_status`
--
ALTER TABLE `room_slot_status`
  ADD CONSTRAINT `room_slot_status_ibfk_1` FOREIGN KEY (`Room_id`) REFERENCES `room` (`Room_id`),
  ADD CONSTRAINT `room_slot_status_ibfk_2` FOREIGN KEY (`Slot_id`) REFERENCES `time_slots` (`Slot_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
