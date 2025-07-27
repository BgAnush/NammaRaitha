package com.nammaraitha.nammaraitha_api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DefaultController {

    @GetMapping("/")
    public String home() {
        return "🚀 NammaRaitha API is running!";
    }
}
