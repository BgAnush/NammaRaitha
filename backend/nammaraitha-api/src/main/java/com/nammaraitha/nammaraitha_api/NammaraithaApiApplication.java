package com.nammaraitha.nammaraitha_api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class NammaraithaApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(NammaraithaApiApplication.class, args);
        System.out.println("🚀 NammaRaitha API is running at http://localhost:8080/");
    }
}
