# Operate First Onboarding Automation

## Background

Operate first is an open-source community cloud which enables users to deploy their apps to a cloud environment for development and testing. A developer would normally develop and test their app locally before deploying to a cloud for cost reasons. Operate First allows for better development and testing as developers will be able to run their apps on a cloud-based environment sooner, enabling them to collect useful data. Operate First also allows for developers to provide input to other developers which is where the community aspect comes in. In conclusion, being able to run an app in its intended environment, and being able to get feedback from other developers should allow for faster, smoother, and more enjoyable development of apps.

## Problem

Currently, for a developer to onboard to Operate First they must submit an issue form in the Operate First Apps repo. This issue then gets read by a member of the Operate First Development team, who would have to create the necessary files and make the necessary changes to existing files. After making the changes, they will submit a pull request which then need to be approved to merge the changes to the main branch. Essentially for every developer that wants to onboard the process is the same with just a few variables changed between the different files. The process for onboarding takes time as a person has to do all those steps manually.

## Goal

The goal of this project is to automate the onboarding process up to approving the final pull request. The developer will still have to submit a templated issue form, but this project aims to do all the intermediary steps (creating and changing necessary files, committing files, submitting pull request), so that a member of the Operate First team will only have to approve the final pull request. This will streamline the process, getting rid of the repetitive hands-on steps.

## Implementation plan

This project will be split into two parts:

-    Using Probot (a GitHub framework for building applications) a controller will be made that responds to the correct issue template being submitted. The    controller will take the necessary data from the body of the issue, format it correctly, and pass it.
    - This controller should not respond to other types of issues being created.
    - It will pass on only the necessary data from the body of the issue as there is a lot of metadata contained within the body.
-    Using a Tekton Pipeline, a pipeline will use the metadata passed from the controller to create a patch file, use the patch file to create the necessary   files and make changes to the already existing, and submit a pull request.
    - Mustache CLI will be used to input the data passed from the controller into an already existing template file.
    - Shell variables will be used to use the data passed from the controller to access file names and be used when naming files.
    - GitHub CLI will be used to create interact with GitHub.
