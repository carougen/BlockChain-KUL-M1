# SPCDSS'25 Programming Project - Bitmunt

## What is included in this repo

1. **[assignment](https://gitlab.kuleuven.be/distrinet/education/spcdss/project/spcdss-24-25/project-assignment/-/tree/main/assignment?ref_type=heads)**:
    - **pdf**: You can find the PDF of each assignment [here](https://gitlab.kuleuven.be/distrinet/education/spcdss/project/spcdss-24-25/project-assignment/-/tree/main/assignment/pdf?ref_type=heads). 
    - **skeleton**: 
        - [go-skeleton-for-task-1](https://gitlab.kuleuven.be/distrinet/education/spcdss/project/spcdss-24-25/project-assignment/-/tree/main/assignment/skeleton/go-skeleton-for-task-1?ref_type=heads)
        - [typescript-skeleton-for-task-1](https://gitlab.kuleuven.be/distrinet/education/spcdss/project/spcdss-24-25/project-assignment/-/tree/main/assignment/skeleton/typescript-skeleton-for-task-1?ref_type=heads)
2. **[solution](https://gitlab.kuleuven.be/distrinet/education/spcdss/project/spcdss-24-25/project-assignment/-/tree/main/solution?ref_type=heads)**: 
    This is where you will store your solution.

> **Important:** Always keep your fork updated to ensure you have the latest versions of the assignments and skeleton code. 


## How to use the skeleton code

1. Clone the repository of your group: 
```bash 
git clone <Git URL of the project repository of your group> 
```
2. Pick the skeleton you would like to work on (e.g., Go-skeleton):
```bash
cp -r assignment/skeleton/go-skeleton-for-task-1/* ./solution
```
3. Follow the `README.md` in the skeleton folder to know how to run it. 
    - Go-skeleton: [README.md](https://gitlab.kuleuven.be/distrinet/education/spcdss/project/spcdss-24-25/project-assignment/-/blob/main/assignment/skeleton/go-skeleton-for-task-1/README.md?ref_type=heads)
    - Typescript-skeleton: [README.md](https://gitlab.kuleuven.be/distrinet/education/spcdss/project/spcdss-24-25/project-assignment/-/blob/main/assignment/skeleton/typescript-skeleton-for-task-1/README.md?ref_type=heads)


## How to connect to the VM

We have created a VM for each group on our private cloud in the CS department. 

### [Setting up KU Leuven MFA SSH Certs](https://system.cs.kuleuven.be/cs/system/security/ssh/sshcerts/)

Follow these steps to configure your SSH access: 

1. Download kmk from [this link](https://admin.kuleuven.be/icts/services/ssh-cert).
2. Follow the steps in the [`Usage` section](https://system.cs.kuleuven.be/cs/system/security/ssh/sshcerts/). 
    - via jumphost (student): `ssh -J r0123456@st.cs.kuleuven.be <machine-addr>`

You can also read [Computer Lab Client Systems](https://system.cs.kuleuven.be/cs/system/wegwijs/computerklas/machines/index-E.shtml) page for more information. Please reach out if you encounter any issues. 

### Machine Distribution

| Group No | Student No  | Machine Address|
| ------ | -------- | -------- |
| B1        | r1028730    | student@172.23.31.16  |
| B1        | r1041960    | student@172.23.31.16 |
| B2        | r0840895    | student@172.23.31.112  |
| B2        | r0794184    | student@172.23.31.112   |
| B3        | r1062917    | student@172.23.31.101  |
| B3        | r0849903    | student@172.23.31.101  |



## Submission Guidelines
For each task, you must create a Git tag in your repository corresponding to the version of your code that you want to be graded. Follow the naming conventions below:

1. For submission, use the format `taskX-submission`, where `X` is the task number (1 to 6). Only **correctly tagged** submissions before the hard deadline will be graded. 
2. For ungraded feedback, use the format `taskX-ungraded`. You need to submit it before the soft deadline. 

```bash
# ----- To add a tag -----
git tag task1-submission

# **important!** push the tag to the remote repo to ensure the grader can access it
git push origin task1-submission 

# List all tags in the repository
git tag 



# ----- To delete a tag -----
git tag -d task1-submission

# Remove the tag from the remote repo
git push origin --delete task1-submission

```


Your submission will be graded by executing the following steps:

```bash
cd solution 

docker-compose build

docker-compose up -d

# running test cases

docker-compose down
```

## Deadlines

Please adhere to the following deadlines.

|        | Soft ddl | Hard ddl |
| ------ | -------- | -------- |
| Task 1 | 20/03    | 03/04    |
| Task 2 | 27/03    | 03/04    |
| Task 3 | 03/04    | 10/04    |
| Task 4 | 01/05    | 15/05    |
| Task 5 | 08/05    | 15/05    |
| Task 6 (optional) | 15/05    | 15/05    |

- Soft Deadline: The deadline for **ungraded** feedback. 
- Hard Deadline: The final submission deadline for grading.


If you have any questions regarding the project, send an email to weihong.wang@kuleuven.be


