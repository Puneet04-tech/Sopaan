# Same jar runs as cloud or hub. Build context is the repository root.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY server/pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline
COPY server/src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN useradd --system --uid 10001 sopaan
COPY --from=build /build/target/sopaan-server-1.0.0.jar /app/app.jar
COPY packs /app/packs
COPY tools/dev-keys.json /app/tools/dev-keys.json
RUN mkdir -p /app/data && chown -R sopaan /app
USER sopaan
ENV SOPAAN_PACKS_DIR=/app/packs \
    SOPAAN_KEYS_FILE=/app/tools/dev-keys.json
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
