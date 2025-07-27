package com.nammaraitha.nammaraitha_api.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.nammaraitha.nammaraitha_api.model.User;
import com.nammaraitha.nammaraitha_api.repository.UserRepository;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    public String registerUser(User user) {
        if (userRepository.existsByEmail(user.getEmail())) {
            return "⚠️ User already exists with email: " + user.getEmail();
        }

        try {
            userRepository.save(user);
            return "✅ User registered successfully: " + user.getName();
        } catch (Exception e) {
            return "❌ Failed to register user: " + e.getMessage();
        }
    }
}
