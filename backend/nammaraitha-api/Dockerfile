# Use Maven to build the app
FROM maven:3.9.5-eclipse-temurin-21 AS build
WORKDIR /app
COPY . .
RUN mvn clean package -DskipTests

# Use OpenJDK image to run the app
FROM eclipse-temurin:21
WORKDIR /app
COPY --from=build /app/target/nammaraitha-api-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
