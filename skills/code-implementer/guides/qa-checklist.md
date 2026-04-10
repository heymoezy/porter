# QA Checklist — Code Implementer

Use this before finalizing any code-implementation output.

## 1. Requirement fit
- Does the implementation clearly satisfy the requested behavior?
- Is the scope tight and intentional?
- Are assumptions called out when requirements were incomplete?

## 2. Code quality
- Does the change fit existing project patterns?
- Are naming, structure, and error handling coherent with nearby code?
- Is unnecessary churn avoided?

## 3. Edge cases and risks
- Are important edge cases handled?
- Are backward compatibility or side effects considered?
- Are any remaining risks made explicit?

## 4. Verification
- Was the change tested or otherwise verified appropriately?
- Is unverified behavior clearly labeled as such?
- Would a reviewer know how to validate the implementation?

## 5. Overall strength
- Is the change easy to review?
- Does it solve the problem without overengineering it?
- Would another engineer trust and maintain this implementation?
