package com.nammaraitha.nammaraitha_api.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.nammaraitha.nammaraitha_api.model.User;
import com.nammaraitha.nammaraitha_api.service.UserService;

@RestController
@RequestMapping("/api/user")
@CrossOrigin(origins = "*") // Allow frontend to call this API
public class UserController {

    @Autowired
    private UserService userService;

    @PostMapping("/signup")
    public String signup(@RequestBody User user) {
        return userService.registerUser(user);
    }
}
