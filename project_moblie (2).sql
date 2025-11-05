-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 05, 2025 at 06:05 PM
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
  `Start_time` datetime NOT NULL,
  `End_time` datetime NOT NULL,
  `Status` enum('approved','rejected','pending...') NOT NULL,
  `User_id` int(11) NOT NULL,
  `Room_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `history`
--

CREATE TABLE `history` (
  `Log_id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `action` varchar(50) NOT NULL,
  `action_by` int(11) NOT NULL,
  `action_time` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `room`
--

CREATE TABLE `room` (
  `Room_id` int(11) NOT NULL,
  `Room_name` varchar(255) NOT NULL,
  `Status` enum('Approve','Rejected','Pending') NOT NULL,
  `Room_detail` varchar(255) NOT NULL,
  `Time_status_08` enum('Free','Pending...','Reserved','Disabled') NOT NULL DEFAULT 'Free',
  `Time_status_10` enum('Free','Pending...','Reserved','Disabled') NOT NULL DEFAULT 'Free',
  `Time_status_13` enum('Free','Pending...','Reserved','Disabled') NOT NULL DEFAULT 'Free',
  `Time_status_15` enum('Free','Pending...','Reserved','Disabled') NOT NULL DEFAULT 'Free',
  `image_url` varchar(255) NOT NULL,
  `max_adult` int(11) NOT NULL,
  `price_per_day` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `room`
--

INSERT INTO `room` (`Room_id`, `Room_name`, `Status`, `Room_detail`, `Time_status_08`, `Time_status_10`, `Time_status_13`, `Time_status_15`, `image_url`, `max_adult`, `price_per_day`) VALUES
(1, 'Deluxe Twin Room', '', '2 single beds - breakfast', 'Free', 'Free', 'Free', 'Free', 'assets/imgs/room3.jpg', 2, 800);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `User_id` int(11) NOT NULL,
  `username` varchar(64) NOT NULL,
  `password` char(60) NOT NULL,
  `role` enum('Users','Staff','Lecturer') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`User_id`, `username`, `password`, `role`) VALUES
(1, 'aa', '$2b$10$lEPKWurFai5tQjrSf38/0O4d7Ydn3waVlGz8UT6Ef8LO81O1M8.p6', 'Users'),
(2, 'nnnn', '$2b$10$OU3LtuYMqWeCKkqO5VUFxOel7v/GEuP5x759knWcnD0PvAh3S6t22', 'Users'),
(3, 'bbb', '$2b$10$Ozg3Pf8YUNAbojA4Yz2a/OBSuULurImy/LhI55SvhMNtO3AH2l.pu', 'Users'),
(4, 'ccc', '$2b$10$cj46/sKOuqtfNICpWiHJ5OqS2BBweu2TjJh..ELYeEYyQeXu./a2G', 'Users');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`Booking_id`),
  ADD KEY `user_id` (`User_id`),
  ADD KEY `Room_id` (`Room_id`);

--
-- Indexes for table `history`
--
ALTER TABLE `history`
  ADD PRIMARY KEY (`Log_id`),
  ADD KEY `booking_id` (`booking_id`),
  ADD KEY `action_by` (`action_by`);

--
-- Indexes for table `room`
--
ALTER TABLE `room`
  ADD PRIMARY KEY (`Room_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`User_id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `bookings`
--
ALTER TABLE `bookings`
  MODIFY `Booking_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `room`
--
ALTER TABLE `room`
  MODIFY `Room_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `User_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `bookings`
--
ALTER TABLE `bookings`
  ADD CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`User_id`) REFERENCES `users` (`User_id`),
  ADD CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`Room_id`) REFERENCES `room` (`Room_id`);

--
-- Constraints for table `history`
--
ALTER TABLE `history`
  ADD CONSTRAINT `history_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`Booking_id`),
  ADD CONSTRAINT `history_ibfk_2` FOREIGN KEY (`action_by`) REFERENCES `users` (`User_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
