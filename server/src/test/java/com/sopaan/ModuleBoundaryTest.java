package com.sopaan;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * The monolith stays modular (design 5.2.1). Boundaries are executable here so a later change
 * cannot quietly turn the module layout into a ball of mud.
 */
class ModuleBoundaryTest {

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.sopaan");
    }

    @Test
    void modulesHaveNoCyclesBetweenThem() {
        ArchRule rule = slices().matching("com.sopaan.(*)..")
                .should().beFreeOfCycles();
        rule.check(classes);
    }

    @Test
    void commonDependsOnNothingElse() {
        ArchRule rule = noClasses().that().resideInAPackage("com.sopaan.common..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.sopaan.rules..", "com.sopaan.passport..", "com.sopaan.sync..",
                        "com.sopaan.cohort..", "com.sopaan.credits..", "com.sopaan.audit..",
                        "com.sopaan.auth..", "com.sopaan.consent..", "com.sopaan.realtime..");
        rule.check(classes);
    }

    @Test
    void securityDoesNotReachIntoDomainModules() {
        ArchRule rule = noClasses().that().resideInAPackage("com.sopaan.security..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.sopaan.rules..", "com.sopaan.passport..", "com.sopaan.credits..",
                        "com.sopaan.cohort..", "com.sopaan.consent..");
        rule.check(classes);
    }

    @Test
    void domainModulesNeverUseTheWebLayerOfAnotherModule() {
        ArchRule rule = noClasses().that().resideInAPackage("com.sopaan.common..")
                .should().dependOnClassesThat().haveSimpleNameEndingWith("Controller");
        rule.check(classes);
    }
}
