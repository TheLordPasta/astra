[1mdiff --git a/src/classroom/classroomTools.ts b/src/classroom/classroomTools.ts[m
[1mindex 31bf5b1..bd647d8 100644[m
[1m--- a/src/classroom/classroomTools.ts[m
[1m+++ b/src/classroom/classroomTools.ts[m
[36m@@ -439,6 +439,13 @@[m [mexport async function executeClassroomTool([m
         });[m
     }[m
   } catch (error) {[m
[32m+[m[32m    // Let research failures reach runtimeSafety as exceptions.[m
[32m+[m[32m    // Otherwise they become legacy { error: "..." } results and lose[m
[32m+[m[32m    // their original failure classification.[m
[32m+[m[32m    if (name === "run_market_research") {[m
[32m+[m[32m      throw error;[m
[32m+[m[32m    }[m
[32m+[m
     return JSON.stringify({[m
       error:[m
         error instanceof Error ? error.message : "Unknown Classroom tool error",[m
